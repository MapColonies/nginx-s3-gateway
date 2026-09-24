import base from "/etc/nginx/auth.js";

// Combined auth handler: OPA check then S3 credential retrieval.
async function combinedAuth(r) {
  try {
    if (r.variables.original_method !== "OPTIONS") {
      const opaResp = await r.subrequest("/opa", {
        body: base.buildOpaBody(r),
        method: "POST",
      });

      if (opaResp.status > 500) {
        r.variables.opa_result = 'error';
        r.variables.opa_reason = '';
        return r.return(opaResp.status);
      }

      const opaResult = JSON.parse(opaResp.responseText).result;
      if (!opaResult.allowed) {
        const reason = base.opaDenyReason(opaResult);
        r.error(reason);
        r.variables.opa_result = 'false';
        r.variables.opa_reason = reason;
        const code = reason.includes("no token supplied") ? 401 : 403;
        return r.return(code);
      }

      r.variables.opa_result = 'true';
      r.variables.opa_reason = '';
    }

    const credResp = await r.subrequest("/aws/credentials/retrieve");
    r.return(credResp.status);
  } catch (error) {
    r.error(error);
    r.variables.opa_result = 'error';
    r.return(500);
  }
}

export default {
  opaAuth: base.opaAuth,
  jwtPayloadSub: base.jwtPayloadSub,
  combinedAuth,
};
