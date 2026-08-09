import { EventEmitter } from 'node:events';

export class JsonRpcError extends Error {
  constructor(code, message, data) {
    super(message);
    this.name = 'JsonRpcError';
    this.code = code;
    this.data = data;
  }
}

export class JsonLineReader extends EventEmitter {
  #buffer = '';

  constructor(stream) {
    super();
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => this.#onData(chunk));
    stream.on('error', (error) => this.emit('error', error));
    stream.on('end', () => {
      if (this.#buffer.trim()) {
        this.emit('error', new Error('JSON-RPC stream ended with an incomplete message'));
      }
      this.emit('end');
    });
  }

  #onData(chunk) {
    this.#buffer += chunk;
    let newlineIndex = this.#buffer.indexOf('\n');

    while (newlineIndex >= 0) {
      const line = this.#buffer.slice(0, newlineIndex).replace(/\r$/, '');
      this.#buffer = this.#buffer.slice(newlineIndex + 1);
      if (line.trim()) {
        try {
          this.emit('message', JSON.parse(line));
        } catch (error) {
          this.emit('error', new Error(`Invalid JSON-RPC message: ${error.message}`));
        }
      }
      newlineIndex = this.#buffer.indexOf('\n');
    }
  }
}

export function sendJsonLine(stream, message) {
  stream.write(`${JSON.stringify(message)}\n`);
}

export function isResponse(message) {
  return Boolean(
    message &&
    Object.prototype.hasOwnProperty.call(message, 'id') &&
    (Object.prototype.hasOwnProperty.call(message, 'result') ||
      Object.prototype.hasOwnProperty.call(message, 'error')),
  );
}

export function isRequest(message) {
  return Boolean(
    message &&
    Object.prototype.hasOwnProperty.call(message, 'id') &&
    typeof message.method === 'string',
  );
}

export function requestKey(id) {
  return `${typeof id}:${String(id)}`;
}
