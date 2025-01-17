/* @flow */
/* global window */

import superagent from 'superagent';
import { EndpointDefinition, StatusAnnouncement } from '../../core/flow_interfaces';

function log(req: Object) {
  let _pickLogger = () => {
    if (console && console.log) return console; // eslint-disable-line no-console
    if (window && window.console && window.console.log) return window.console;
    return console;
  };

  let start = new Date().getTime();
  let timestamp = new Date().toISOString();
  let logger = _pickLogger();
  logger.log('<<<<<'); // eslint-disable-line no-console
  logger.log(`[${timestamp}]`, '\n', req.url, '\n', req.qs); // eslint-disable-line no-console
  logger.log('-----'); // eslint-disable-line no-console

  req.on('response', (res) => {
    let now = new Date().getTime();
    let elapsed = now - start;
    let timestampDone = new Date().toISOString();

    logger.log('>>>>>>'); // eslint-disable-line no-console
    logger.log(`[${timestampDone} / ${elapsed}]`, '\n', req.url, '\n', req.qs, '\n', res.text); // eslint-disable-line no-console
    logger.log('-----'); // eslint-disable-line no-console
  });
}

function xdr(superagentConstruct: superagent, endpoint: EndpointDefinition, callback: Function): Object {
  if (this._config.logVerbosity) {
    superagentConstruct = superagentConstruct.use(log);
  }

  if (this._config.proxy && this._modules.proxy) {
    superagentConstruct = this._modules.proxy.call(this, superagentConstruct);
  }

  if (this._config.keepAlive && this._modules.keepAlive) {
    superagentConstruct = this._modules.keepAlive(superagentConstruct);
  }

  let sc = superagentConstruct;

  if (endpoint.forceBuffered === true) {
    if (typeof Blob === 'undefined') {
      sc = sc.buffer().responseType('arraybuffer');
    } else {
      sc = sc.responseType('arraybuffer');
    }
  } else if (endpoint.forceBuffered === false) {
    sc = sc.buffer(false);
  }

  return sc.timeout(endpoint.timeout).end((err, resp) => {
    let parsedResponse;
    let status: StatusAnnouncement = {};
    status.error = err !== null;
    status.operation = endpoint.operation;

    if (resp && resp.status) {
      status.statusCode = resp.status;
    }

    if (err) {
      if (err.response && err.response.text && !this._config.logVerbosity) {
        try {
          status.errorData = JSON.parse(err.response.text);
        } catch (e) {
          status.errorData = err;
        }
      } else {
        status.errorData = err;
      }
      status.category = this._detectErrorCategory(err);
      return callback(status, null);
    }

    if (endpoint.ignoreBody) {
      parsedResponse = {
        headers: resp.headers,
        redirects: resp.redirects,
        response: resp,
      };
    } else {
      try {
        parsedResponse = JSON.parse(resp.text);
      } catch (e) {
        status.errorData = resp;
        status.error = true;
        return callback(status, null);
      }
    }

    if (
      parsedResponse.error &&
      parsedResponse.error === 1 &&
      parsedResponse.status &&
      parsedResponse.message &&
      parsedResponse.service
    ) {
      status.errorData = parsedResponse;
      status.statusCode = parsedResponse.status;
      status.error = true;
      status.category = this._detectErrorCategory(status);
      return callback(status, null);
    } else if (parsedResponse.error && parsedResponse.error.message) {
      status.errorData = parsedResponse.error;
    }

    return callback(status, parsedResponse);
  });
}


function nativeXdr(superagentConstruct: superagent, endpoint: EndpointDefinition, callback: Function): Object {
  var _this = this;

  var options = {
    method: 'GET',
    headers: {
      Connection: "keep-alive"
    },
    responseType: "json",
    timeout: endpoint.timeout
  };

  if (endpoint.forceBuffered === true) {
    options.responseType = "arraybuffer"
  }
  
  var err = null, resp;
  var url = superagentConstruct.url += (superagentConstruct._query && superagentConstruct._query[0] ? "?" + superagentConstruct._query[0] : "");

  sendRequest(url, options, endpoint.timeout/1000).then(response=> {
    resp = response;
  }).catch((error)=>{
    err = error;
  }).then(()=>{
    var parsedResponse;
    var status = {};
    status.error = err !== null;
    status.operation = endpoint.operation;

    if (resp && resp.status) {
      status.statusCode = resp.status;
    }

    if (err) {
      if (err.response && err.response.text && !_this._config.logVerbosity) {
        try {
          status.errorData = JSON.parse(err.response.text);
        } catch (e) {
          status.errorData = err;
        }
      } else {
        status.errorData = err;
      }

      status.category = _this._detectErrorCategory(err);
      return callback(status, null);
    }

    if (endpoint.ignoreBody) {
      parsedResponse = {
        headers: resp.headers,
        redirects: resp.redirects,
        response: resp
      };
    } else {
      try {
        parsedResponse = resp.data
      } catch (e) {
        status.errorData = resp;
        status.error = true;
        return callback(status, null);
      }
    }

    if (parsedResponse.error && parsedResponse.error === 1 && parsedResponse.status && parsedResponse.message && parsedResponse.service) {
      status.errorData = parsedResponse;
      status.statusCode = parsedResponse.status;
      status.error = true;
      status.category = _this._detectErrorCategory(status);
      return callback(status, null);
    } else if (parsedResponse.error && parsedResponse.error.message) {
      status.errorData = parsedResponse.error;
    }
    callback(status, parsedResponse)
  });
}

function sendRequest(url, options, timeout){
  cordova.plugin.http.setRequestTimeout(timeout);
  return new Promise((resolve, reject) => cordova.plugin.http.sendRequest(url, options, resolve, reject));
}

export async function postfile(
  url: string,
  fields: $ReadOnlyArray<{ key: string, value: string }>,
  fileInput: any
): Promise<any> {
  let agent = superagent.post(url);

  fields.forEach(({ key, value }) => {
    agent = agent.field(key, value);
  });

  agent.attach('file', fileInput, { contentType: 'application/octet-stream' });

  const result = await agent;

  return result;
}

export function getfile(params: Object, endpoint: EndpointDefinition, callback: Function): superagent {
  let superagentConstruct = superagent
    .get(this.getStandardOrigin() + endpoint.url)
    .set(endpoint.headers)
    .query(params);
  return xdr.call(this, superagentConstruct, endpoint, callback);
}

export function get(params: Object, endpoint: EndpointDefinition, callback: Function): superagent {
  let superagentConstruct = superagent
    .get(this.getStandardOrigin() + endpoint.url)
    .set(endpoint.headers)
    .query(params);

  try {
    return nativeXdr.call(this, superagentConstruct, endpoint, callback);
  }
  catch(e){
      return xdr.call(this, superagentConstruct, endpoint, callback);
  }
}

export function post(params: Object, body: string, endpoint: EndpointDefinition, callback: Function): superagent {
  let superagentConstruct = superagent
    .post(this.getStandardOrigin() + endpoint.url)
    .query(params)
    .set(endpoint.headers)
    .send(body);
  return xdr.call(this, superagentConstruct, endpoint, callback);
}

export function patch(params: Object, body: string, endpoint: EndpointDefinition, callback: Function): superagent {
  let superagentConstruct = superagent
    .patch(this.getStandardOrigin() + endpoint.url)
    .query(params)
    .set(endpoint.headers)
    .send(body);
  return xdr.call(this, superagentConstruct, endpoint, callback);
}

export function del(params: Object, endpoint: EndpointDefinition, callback: Function): superagent {
  let superagentConstruct = superagent
    .delete(this.getStandardOrigin() + endpoint.url)
    .set(endpoint.headers)
    .query(params);
  return xdr.call(this, superagentConstruct, endpoint, callback);
}
