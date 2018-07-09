/**
 * @module conan
 * @desc 核心逻辑-错误捕捉
 * @author ervinewell on 2017/8/2.
 */
import {
  pick as _pick,
  isArray as _isArray,
  isObject as _isObject,
  isPlainObject as _isPlainObject,
  isFunction as _isFunction
} from 'lodash';
import { sendMessage } from './sendMessage';
import { stringify } from './utils';

/**
 * 监听js错误
 */
export const setupErrorListener = (window: any): void => {
  window.onerror = (
    msg: string,
    url: string,
    line: number,
    column: number,
    err: any
  ) => {
    sendMessage({
      type: 'JSError',
      message: {
        msg,
        url,
        position: `第${line}行左起第${column}个字符`,
        error: stringify(err)
      }
    });
  }
}

/**
 * 拦截控制台信息
 */
export const setupConsole = function (window: any): void {
  const { console } = window;
  const { log, time, timeEnd, error, warn } = console;
  console.log = (...args): void => {
    if (args[0] !== 'conan-inner-log') { // 不监听conan内部打印信息
      sendMessage({
        type: 'Console',
        message: [].map.call(args, formatMsg),
        tag: 'log'
      });
    }
    log.call(this, ...args);
  }
  console.error = (...args): void => {
    sendMessage({
      type: 'Console',
      tag: 'error',
      message: [].map.call(args, formatMsg)
    });
    error.call(this, ...args);
  };
  console.warn = (...args): void => {
    sendMessage({
      type: 'Console',
      tag: 'warn',
      message: [].map.call(args, formatMsg)
    });
    warn.call(this, ...args);
  };
  
  const timerMap = {};
  console.time = (id = 'default'): void => {
    timerMap[id] = Date.now();
    sendMessage({
      type: 'Console',
      message: [`timer-${id} start...`]
    });
    time.call(this, id);
  };
  console.timeEnd = (id = 'default'): void => {
    const now = Date.now();
    if (id in timerMap) {
      sendMessage({
        type: 'Console',
        message: [`timer-${id} end: ${now - timerMap[id]}ms`]
      });
      delete timerMap[id];
    } else {
      sendMessage({
        type: 'Console',
        tag: 'error',
        message: [`timer-${id}不存在`]
      });
    }
    timeEnd.call(this, id);
  }; 
};

/**
 * 网络请求信息-XHR
 */
export const setupXHR = function (window: any): void {
  const { XMLHttpRequest: XHR } = window;
  const { open, setRequestHeader, send } = XHR.prototype;
  XHR.prototype.open = function (...args): void {
    const [method, url] = args;
    this._cnInfo = {
      ...this._cnInfo,
      id: Date.now(),
      url,
      method,
      headers: {}
    };
    open.call(this, ...args);
    
    this.onloadend = function (): void {
      const message = {
        method: 'GET',
        ...this._cnInfo,
        ..._pick(this, ['status', 'timeout']),
        res: this.response || null,
        resURL: this.responseURL || null,
        headers: stringify(this._cnInfo.headers || {})
      };
      sendMessage({
        type: 'NetWork',
        message
      });
    };
  };
  
  XHR.prototype.setRequestHeader = function (...args): void {
    const [key, value] = args;
    this._cnInfo.headers = {
      ...this._cnInfo.headers,
      [key]: value
    };
    setRequestHeader.call(this, ...args);
  };
  
  XHR.prototype.send = function (body: any): void {
   this._cnInfo = {
     ...this._cnInfo,
     body
    };
    send.call(this, body);
  };
}

/**
 * 网络请求信息-fetch
 */
export const setupFetch = function (window: any): boolean {
  if (!('fetch' in window && 'Request' in window)) {
    return false;
  }
  const _fetch = window.fetch;
  window.fetch = function (...args): void {
    const message = {};
    switch (args.length) {
      case 1: {
        if (args[0] instanceof Request) {
          const { method, headers, url } = args[0];
          const headerMap = {};
          
          for(const key of headers.keys()) { // headers由Headers构造器生成
            headerMap[key] = headers.get(key);
          }
          Object.assign(message, {
            method,
            headers: stringify(headerMap),
            url
          });
        } else {
          Object.assign(message, {
            url: args[0],
            method: 'get'
          });
        }
        break;
      }
      case 2: {
        const [url, init] = args;
        Object.assign(message, {
          url,
          ...init,
          headers: stringify(init.headers || {})
        });
        break;
      }
      default:
    }
    
    return _fetch.call(this, ...args)
      .then(res => {
        res.clone().json().then(data => {
          sendMessage({
            type: 'NetWork',
            message: {
              method: 'GET',
              ...message,
              status: Number(res.status),
              res: stringify(data)
            }
          });
        });
        return res;
      })
      .catch(err => {
        sendMessage({
          type: 'NetWork',
          message: {
            method: 'GET',
            ...message,
            error: err.message
          }
        });
        throw err;
      });
  };
  return true;
};

/**
 * 启动器
 * @param $conan[挂载节点]
 */
export default ($conan) => {
  setupErrorListener(window);
  setupConsole(window);
  setupXHR(window);
  setupFetch(window);
};

/**
 * 对象 -> 虚拟dom
 * @param obj
 */
const formatObj = (obj: string):  => h('div',
  obj.split('\n').map(item => h('div',
    item.split('').map(v => v === ' ' ? h('span', '&nbsp;') : v)
  ))
);

/**
 * 格式化信息
 * @param msg 
 */
const formatMsg = (msg: any): any => {
  const hint = 'Object只能打印出非函数类型的属性';

  if (_isArray(msg)) {
    return stringify(msg);
  }
  if (_isPlainObject(msg)) {
    return `${hint}\n${formatObj(stringify(msg))}`
  }
  if (_isFunction(msg)) {
    return formatObj(msg.toString());
  }
  if (_isObject(msg)) {
    return msg.constructor.name;
  }
  return msg;
};

