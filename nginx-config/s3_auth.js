import qs from "querystring";
import base from "/etc/nginx/auth.js";

// Gateway-specific auth layered on the shared OPA/JWT core.
//
// The base module (opaAuth, jwtPayloadSub) is inherited unchanged from the
// MapColonies nginx image at /etc/nginx/auth.js. This module adds combinedAuth,
// which is coupled to the S3 gateway: it calls /aws/credentials/retrieve, a
// location that only exists in the nginx-s3-gateway config. It therefore cannot
// live in the general nginx image and is kept here instead.
//
// The default export re-exports the base members so a single
// `js_import auth from /etc/nginx/s3_auth.js` still resolves auth.jwtPayloadSub
// (js_set) and auth.opaAuth alongside auth.combinedAuth.

function buildOpaBody(r) {
  return JSON.stringify({
    input: {
      method: r.variables.original_method,
      headers: {
        'user-agent': r.headersIn['user-agent'],
        'origin': r.headersIn['origin'],
        'referer': r.headersIn['referer'],
        'x-api-key': r.headersIn['x-api-key'],
        'host': r.headersIn['host'],
        'x-forwarded-for': r.headersIn['x-forwarded-for'],
        'x-forwarded-host': r.headersIn['x-forwarded-host'],
        'x-forwarded-proto': r.headersIn['x-forwarded-proto'],
        'x-real-ip': r.headersIn['x-real-ip'],
        'content-type': r.headersIn['content-type'],
        'content-length': r.headersIn['content-length'],
      },
      query: qs.parse(r.variables.original_args),
      domain: r.variables.domain,
    },
  });
}

// Combined auth handler: OPA check then S3 credential retrieval.
// Used as js_content in /_combined_auth (single auth_request replaces two).
// Passes OPA result/reason back via response headers for auth_request_set.
async function combinedAuth(r) {
  try {
    if (r.variables.original_method !== "OPTIONS") {
      const opaResp = await r.subrequest("/opa", {
        body: buildOpaBody(r),
        method: "POST",
      });

      if (opaResp.status > 500) {
        r.headersOut['X-OPA-Result'] = 'error';
        r.headersOut['X-OPA-Reason'] = '';
        return r.return(opaResp.status);
      }

      const opaResult = JSON.parse(opaResp.responseText).result;
      if (!opaResult.allowed) {
        r.error(opaResult.reason);
        r.headersOut['X-OPA-Result'] = 'false';
        r.headersOut['X-OPA-Reason'] = opaResult.reason;
        const code = opaResult.reason.includes("no token supplied") ? 401 : 403;
        return r.return(code);
      }

      r.headersOut['X-OPA-Result'] = 'true';
      r.headersOut['X-OPA-Reason'] = '';
    }

    const credResp = await r.subrequest("/aws/credentials/retrieve");
    r.return(credResp.status);
  } catch (error) {
    r.error(error);
    r.headersOut['X-OPA-Result'] = 'error';
    r.return(500);
  }
}

export default {
  opaAuth: base.opaAuth,
  jwtPayloadSub: base.jwtPayloadSub,
  combinedAuth,
};
