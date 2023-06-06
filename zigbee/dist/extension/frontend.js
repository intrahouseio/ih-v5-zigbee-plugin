"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const https_1 = __importDefault(require("https"));
const connect_gzip_static_1 = __importDefault(require("connect-gzip-static"));
const finalhandler_1 = __importDefault(require("finalhandler"));
const logger_1 = __importDefault(require("../util/logger"));
const zigbee2mqtt_frontend_1 = __importDefault(require("zigbee2mqtt-frontend"));
const ws_1 = __importDefault(require("ws"));
const url_1 = __importDefault(require("url"));
const fs_1 = __importDefault(require("fs"));
const settings = __importStar(require("../util/settings"));
const utils_1 = __importDefault(require("../util/utils"));
const json_stable_stringify_without_jsonify_1 = __importDefault(require("json-stable-stringify-without-jsonify"));
const extension_1 = __importDefault(require("./extension"));
const bind_decorator_1 = __importDefault(require("bind-decorator"));
/**
 * This extension servers the frontend
 */
class Frontend extends extension_1.default {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus, enableDisableExtension, restartCallback, addExtension) {
        super(zigbee, mqtt, state, publishEntityState, eventBus, enableDisableExtension, restartCallback, addExtension);
        this.mqttBaseTopic = settings.get().mqtt.base_topic;
        this.host = settings.get().frontend.host;
        this.port = settings.get().frontend.port;
        this.sslCert = settings.get().frontend.ssl_cert;
        this.sslKey = settings.get().frontend.ssl_key;
        this.authToken = settings.get().frontend.auth_token;
        this.retainedMessages = new Map();
        this.wss = null;
        this.eventBus.onMQTTMessagePublished(this, this.onMQTTPublishMessage);
    }
    isHttpsConfigured() {
        if (this.sslCert && this.sslKey) {
            if (!fs_1.default.existsSync(this.sslCert) || !fs_1.default.existsSync(this.sslKey)) {
                logger_1.default.error(`defined ssl_cert '${this.sslCert}' or ssl_key '${this.sslKey}' file path does not exists, server won't be secured.`); /* eslint-disable-line max-len */
                return false;
            }
            return true;
        }
        return false;
    }
    async start() {
        if (this.isHttpsConfigured()) {
            const serverOptions = {
                key: fs_1.default.readFileSync(this.sslKey),
                cert: fs_1.default.readFileSync(this.sslCert)
            };
            this.server = https_1.default.createServer(serverOptions, this.onRequest);
        }
        else {
            this.server = http_1.default.createServer(this.onRequest);
        }
        this.server.on('upgrade', this.onUpgrade);
        /* istanbul ignore next */
        const options = {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setHeaders: (res, path) => {
                if (path.endsWith('index.html')) {
                    res.setHeader('Cache-Control', 'no-store');
                }
            },
        };
        this.fileServer = (0, connect_gzip_static_1.default)(zigbee2mqtt_frontend_1.default.getPath(), options);
        this.wss = new ws_1.default.Server({ noServer: true });
        this.wss.on('connection', this.onWebSocketConnection);
        if (this.host.startsWith('/')) {
            this.server.listen(this.host);
            logger_1.default.info(`Started frontend on socket ${this.host}`);
        }
        else {
            this.server.listen(this.port, this.host);
            logger_1.default.info(`Started frontend on port ${this.host}:${this.port}`);
        }
    }
    async stop() {
        var _a, _b;
        super.stop();
        (_a = this.wss) === null || _a === void 0 ? void 0 : _a.clients.forEach((client) => {
            client.send((0, json_stable_stringify_without_jsonify_1.default)({ topic: 'bridge/state', payload: 'offline' }));
            client.terminate();
        });
        (_b = this.wss) === null || _b === void 0 ? void 0 : _b.close();
        /* istanbul ignore else */
        if (this.server) {
            return new Promise((cb) => this.server.close(cb));
        }
    }
    onRequest(request, response) {
        // @ts-ignore
        this.fileServer(request, response, (0, finalhandler_1.default)(request, response));
    }
    authenticate(request, cb) {
        const { query } = url_1.default.parse(request.url, true);
        cb(!this.authToken || this.authToken === query.token);
    }
    onUpgrade(request, socket, head) {
        this.wss.handleUpgrade(request, socket, head, (ws) => {
            this.authenticate(request, (isAuthenticated) => {
                if (isAuthenticated) {
                    this.wss.emit('connection', ws, request);
                }
                else {
                    ws.close(4401, 'Unauthorized');
                }
            });
        });
    }
    onWebSocketConnection(ws) {
        ws.on('message', (data, isBinary) => {
            if (!isBinary && data) {
                const message = data.toString();
                const { topic, payload } = JSON.parse(message);
                this.mqtt.onMessage(`${this.mqttBaseTopic}/${topic}`, (0, json_stable_stringify_without_jsonify_1.default)(payload));
            }
        });
        for (const [key, value] of this.retainedMessages) {
            ws.send((0, json_stable_stringify_without_jsonify_1.default)({ topic: key, payload: value }));
        }
        for (const device of this.zigbee.devices(false)) {
            const payload = this.state.get(device);
            const lastSeen = settings.get().advanced.last_seen;
            /* istanbul ignore if */
            if (lastSeen !== 'disable') {
                payload.last_seen = utils_1.default.formatDate(device.zh.lastSeen, lastSeen);
            }
            if (device.zh.linkquality !== undefined) {
                payload.linkquality = device.zh.linkquality;
            }
            ws.send((0, json_stable_stringify_without_jsonify_1.default)({ topic: device.name, payload }));
        }
    }
    onMQTTPublishMessage(data) {
        if (data.topic.startsWith(`${this.mqttBaseTopic}/`)) {
            // Send topic without base_topic
            const topic = data.topic.substring(this.mqttBaseTopic.length + 1);
            const payload = utils_1.default.parseJSON(data.payload, data.payload);
            if (data.options.retain) {
                this.retainedMessages.set(topic, payload);
            }
            if (this.wss) {
                for (const client of this.wss.clients) {
                    /* istanbul ignore else */
                    if (client.readyState === ws_1.default.OPEN) {
                        client.send((0, json_stable_stringify_without_jsonify_1.default)({ topic, payload }));
                    }
                }
            }
        }
    }
}
exports.default = Frontend;
__decorate([
    bind_decorator_1.default
], Frontend.prototype, "onRequest", null);
__decorate([
    bind_decorator_1.default
], Frontend.prototype, "onUpgrade", null);
__decorate([
    bind_decorator_1.default
], Frontend.prototype, "onWebSocketConnection", null);
__decorate([
    bind_decorator_1.default
], Frontend.prototype, "onMQTTPublishMessage", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZnJvbnRlbmQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9saWIvZXh0ZW5zaW9uL2Zyb250ZW5kLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxnREFBd0I7QUFDeEIsa0RBQTBCO0FBQzFCLDhFQUErRDtBQUMvRCxnRUFBd0M7QUFDeEMsNERBQW9DO0FBQ3BDLGdGQUE0QztBQUM1Qyw0Q0FBMkI7QUFFM0IsOENBQXNCO0FBQ3RCLDRDQUFvQjtBQUNwQiwyREFBNkM7QUFDN0MsMERBQWtDO0FBQ2xDLGtIQUE4RDtBQUM5RCw0REFBb0M7QUFDcEMsb0VBQWtDO0FBRWxDOztHQUVHO0FBQ0gsTUFBcUIsUUFBUyxTQUFRLG1CQUFTO0lBYTNDLFlBQVksTUFBYyxFQUFFLElBQVUsRUFBRSxLQUFZLEVBQUUsa0JBQXNDLEVBQ3hGLFFBQWtCLEVBQUUsc0JBQXdFLEVBQzVGLGVBQTJCLEVBQUUsWUFBcUQ7UUFDbEYsS0FBSyxDQUFDLE1BQU0sRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLGtCQUFrQixFQUFFLFFBQVEsRUFBRSxzQkFBc0IsRUFBRSxlQUFlLEVBQUUsWUFBWSxDQUFDLENBQUM7UUFmNUcsa0JBQWEsR0FBRyxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQztRQUMvQyxTQUFJLEdBQUcsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUM7UUFDcEMsU0FBSSxHQUFHLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDO1FBQ3BDLFlBQU8sR0FBRyxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQztRQUMzQyxXQUFNLEdBQUcsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUM7UUFDekMsY0FBUyxHQUFHLFFBQVEs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