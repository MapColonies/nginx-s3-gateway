import qs from "querystring";

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

async function opaAuth(r) {
  try {
    if (r.variables.original_method == "OPTIONS") {
      return r.return(204);
    }

    const response = await r.subrequest("/opa", {
      body: buildOpaBody(r),
      method: "POST",
    });

    if (response.status > 500) {
      return r.return(response.status);
    }

    const opaResult = JSON.parse(response.responseText).result;
    if (!opaResult.allowed) {
      r.error(opaResult.reason);
      const returnCode = opaResult.reason.includes("no token supplied")
        ? 401
        : 403;
      r.variables.opa_result = "false";
      r.variables.opa_reason = opaResult.reason;
      return r.return(returnCode);
    }
    r.variables.opa_result = "true";
    r.variables.opa_reason = "";
    r.return(204);
  } catch (error) {
    r.error(error);
    r.variables.opa_result = "error";
    r.return(500);
  }
}

function jwt(data) {
  if (data) {
    var parts = data
      .split(".")
      .slice(0, 2)
      .map((v) => Buffer.from(v, "base64url").toString())
      .map(JSON.parse);
    return { headers: parts[0], payload: parts[1] };
  } else {
    return;
  }
}

function jwtPayloadSub(r) {
  try {
    let token;
    if (r.args["token"]) token = jwt(r.args["token"]);
    else if (r.headersIn["x-api-key"]) token = jwt(r.headersIn["x-api-key"]);
    else return "";

    return token.payload.sub;
  } catch (error) {
    return "";
  }
}

export default { combinedAuth, opaAuth, jwtPayloadSub };
