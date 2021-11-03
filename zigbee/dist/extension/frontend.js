"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
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
const serve_static_1 = __importDefault(require("serve-static"));
const finalhandler_1 = __importDefault(require("finalhandler"));
const logger_1 = __importDefault(require("../util/logger"));
const zigbee2mqtt_frontend_1 = __importDefault(require("zigbee2mqtt-frontend"));
const ws_1 = __importDefault(require("ws"));
const url_1 = __importDefault(require("url"));
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
        this.host = settings.get().frontend.host || '0.0.0.0';
        this.port = settings.get().frontend.port || 8080;
        this.authToken = settings.get().frontend.auth_token || false;
        this.retainedMessages = new Map();
        this.wss = null;
        this.eventBus.onMQTTMessagePublished(this, this.onMQTTPublishMessage);
    }
    async start() {
        this.server = http_1.default.createServer(this.onRequest);
        this.server.on('upgrade', this.onUpgrade);
        /* istanbul ignore next */ // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const options = { setHeaders: (res, path) => {
                if (path.endsWith('index.html')) {
                    res.setHeader('Cache-Control', 'no-store');
                }
            } };
        this.fileServer = (0, serve_static_1.default)(zigbee2mqtt_frontend_1.default.getPath(), options);
        this.wss = new ws_1.default.Server({ noServer: true });
        this.wss.on('connection', this.onWebSocketConnection);
        this.server.listen(this.port, this.host);
        logger_1.default.info(`Started frontend on port ${this.host}:${this.port}`);
    }
    async stop() {
        super.stop();
        for (const client of this.wss.clients) {
            client.send((0, json_stable_stringify_without_jsonify_1.default)({ topic: 'bridge/state', payload: 'offline' }));
            client.terminate();
        }
        this.wss.close();
        return new Promise((cb) => this.server.close(cb));
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
            this.authenticate(request, (isAuthentificated) => {
                if (isAuthentificated) {
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
            let payload = {};
            if (this.state.exists(device)) {
                payload = { ...payload, ...this.state.get(device) };
            }
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
exports.default = Frontend;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZnJvbnRlbmQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9saWIvZXh0ZW5zaW9uL2Zyb250ZW5kLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGdEQUF3QjtBQUN4QixnRUFBdUM7QUFDdkMsZ0VBQXdDO0FBQ3hDLDREQUFvQztBQUNwQyxnRkFBNEM7QUFDNUMsNENBQTJCO0FBRTNCLDhDQUFzQjtBQUN0QiwyREFBNkM7QUFDN0MsMERBQWtDO0FBQ2xDLGtIQUE4RDtBQUM5RCw0REFBb0M7QUFDcEMsb0VBQWtDO0FBRWxDOztHQUVHO0FBQ0gsTUFBcUIsUUFBUyxTQUFRLG1CQUFTO0lBVzNDLFlBQVksTUFBYyxFQUFFLElBQVUsRUFBRSxLQUFZLEVBQUUsa0JBQXNDLEVBQ3hGLFFBQWtCLEVBQUUsc0JBQXdFLEVBQzVGLGVBQTJCLEVBQUUsWUFBNEM7UUFDekUsS0FBSyxDQUFDLE1BQU0sRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLGtCQUFrQixFQUFFLFFBQVEsRUFBRSxzQkFBc0IsRUFBRSxlQUFlLEVBQUUsWUFBWSxDQUFDLENBQUM7UUFiNUcsa0JBQWEsR0FBRyxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQztRQUMvQyxTQUFJLEdBQUcsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxJQUFJLElBQUksU0FBUyxDQUFDO1FBQ2pELFNBQUksR0FBRyxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLElBQUksSUFBSSxJQUFJLENBQUM7UUFDNUMsY0FBUyxHQUFHLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMsVUFBVSxJQUFJLEtBQUssQ0FBQztRQUN4RCxxQkFBZ0IsR0FBRyxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBSTdCLFFBQUcsR0FBcUIsSUFBSSxDQUFDO1FBTWpDLElBQUksQ0FBQyxR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