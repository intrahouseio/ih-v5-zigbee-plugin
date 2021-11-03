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
const mqtt_1 = __importDefault(require("mqtt"));
const logger_1 = __importDefault(require("./util/logger"));
const settings = __importStar(require("./util/settings"));
const utils_1 = __importDefault(require("./util/utils"));
const fs_1 = __importDefault(require("fs"));
const bind_decorator_1 = __importDefault(require("bind-decorator"));


class MQTT {
    constructor(eventBus) {
        this.publishedTopics = new Set();
        this.eventBus = eventBus;
    }
    async connect() {
        const mqttSettings = settings.get().mqtt;
        logger_1.default.info(`Connecting to MQTT server at ${mqttSettings.server}`);
        const options = {
            will: {
                topic: `${settings.get().mqtt.base_topic}/bridge/state`,
                payload: 'offline',
                retain: settings.get().mqtt.force_disable_retain ? false : true,
                qos: 1,
            },
        };
        if (mqttSettings.version) {
            options.protocolVersion = mqttSettings.version;
        }
        if (mqttSettings.keepalive) {
            logger_1.default.debug(`Using MQTT keepalive: ${mqttSettings.keepalive}`);
            options.keepalive = mqttSettings.keepalive;
        }
        if (mqttSettings.ca) {
            logger_1.default.debug(`MQTT SSL/TLS: Path to CA certificate = ${mqttSettings.ca}`);
            options.ca = fs_1.default.readFileSync(mqttSettings.ca);
        }
        if (mqttSettings.key && mqttSettings.cert) {
            logger_1.default.debug(`MQTT SSL/TLS: Path to client key = ${mqttSettings.key}`);
            logger_1.default.debug(`MQTT SSL/TLS: Path to client certificate = ${mqttSettings.cert}`);
            options.key = fs_1.default.readFileSync(mqttSettings.key);
            options.cert = fs_1.default.readFileSync(mqttSettings.cert);
        }
        if (mqttSettings.user && mqttSettings.password) {
            logger_1.default.debug(`Using MQTT login with username: ${mqttSettings.user}`);
            options.username = mqttSettings.user;
            options.password = mqttSettings.password;
        }
        else {
            logger_1.default.debug(`Using MQTT anonymous login`);
        }
        if (mqttSettings.client_id) {
            logger_1.default.debug(`Using MQTT client ID: '${mqttSettings.client_id}'`);
            options.clientId = mqttSettings.client_id;
        }
        if (mqttSettings.hasOwnProperty('reject_unauthorized') && !mqttSettings.reject_unauthorized) {
            logger_1.default.debug(`MQTT reject_unauthorized set false, ignoring certificate warnings.`);
            options.rejectUnauthorized = false;
        }
        return new Promise((resolve, reject) => {
            this.client = mqtt_1.default.connect(mqttSettings.server, options);
            const onConnect = this.onConnect;
            this.client.on('connect', async () => {
                await onConnect();
                resolve();
            });
            this.client.on('error', (err) => reject(err));
            this.client.on('message', this.onMessage);
        });
    }
    async onConnect() {
        // Set timer at interval to check if connected to MQTT server.
        clearTimeout(this.connectionTimer);
        this.connectionTimer = setInterval(() => {
            if (this.client.reconnecting) {
                logger_1.default.error('Not connected to MQTT server!');
            }
        }, utils_1.default.seconds(10));
        logger_1.default.info('Connected to MQTT server');
        this.subscribe(`${settings.get().mqtt.base_topic}/#`);
        // await this.publish('bridge/state', 'online', { retain: true, qos: 0 });
    }
    async disconnect() {
        clearTimeout(this.connectionTimer);
        await this.publish('bridge/state', 'offline', { retain: true, qos: 0 });
        logger_1.default.info('Disconnecting from MQTT server');
        this.client.end();
    }
    subscribe(topic) {
        console.log('-----subscribe---', topic)
        this.client.subscribe(topic);
    }
    onMessage(topic, message) {
        console.log('-----message---', topic)
        // Since we subscribe to zigbee2mqtt/# we also receive the message we send ourselves, skip these.
        if (!this.publishedTopics.has(topic)) {
            logger_1.default.debug(`Received MQTT message on '${topic}' with data '${message}'`);
            this.eventBus.emitMQTTMessage({ topic, message: message + '' });
        }
    }
    isConnected() {
        return this.client && !this.client.reconnecting;
    }
    async publish(topic, payload, options = {}, base = settings.get().mqtt.base_topic, skipLog = false, skipReceive = true) {
        console.log('-----publish---', topic)

        const defaultOptions = { qos: 0, retain: false };
        topic = `${base}/${topic}`;
        if (skipReceive) {
            this.publishedTopics.add(topic);
        }
        this.eventBus.emitMQTTMessagePublished({ topic, payload, options: { ...defaultOptions, ...options } });
        if (!this.isConnected()) {
            if (!skipLog) {
                logger_1.default.error(`$Not connected to MQTT server!`);
                logger_1.default.error(`$Cannot send message: topic: '${topic}', payload: '${payload}`);
            }
            return;
        }
        if (!skipLog) {
            logger_1.default.info(`MQTT publish: topic '${topic}', payload '${payload}'`);
        }
        const actualOptions = { ...defaultOptions, ...options };
        if (settings.get().mqtt.force_disable_retain) {
            actualOptions.retain = false;
        }
        return new Promise((resolve) => {
            this.client.publish(topic, payload, actualOptions, () => resolve());
        });
    }
}
__decorate([
    bind_decorator_1.default
], MQTT.prototype, "onConnect", null);
__decorate([
    bind_decorator_1.default
], MQTT.prototype, "onMessage", null);
exports.default = MQTT;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibXF0dC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL2xpYi9tcXR0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGdEQUF3QjtBQUN4QiwyREFBbUM7QUFDbkMsMERBQTRDO0FBQzVDLHlEQUFpQztBQUNqQyw0Q0FBb0I7QUFDcEIsb0VBQWtDO0FBRWxDLE1BQXFCLElBQUk7SUFNckIsWUFBWSxRQUFrQjtRQUx0QixvQkFBZSxHQUFnQixJQUFJLEdBQUcsRUFBRSxDQUFDO1FBTTdDLElBQUksQ0FBQyxRQUFRLEdBQUcsUUFBUSxDQUFDO0lBQzdCLENBQUM7SUFFRCxLQUFLLENBQUMsT0FBTztRQUNULE1BQU0sWUFBWSxHQUFHLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUM7UUFDekMsZ0JBQU0sQ0FBQyxJQUFJLENBQUMsZ0NBQWdDLFlBQVksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBRW5FLE1BQU0sT0FBTyxHQUF3QjtZQUNqQyxJQUFJLEVBQUU7Z0JBQ0YsS0FBSyxFQUFFLEdBQUcsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLGVBQWU7Z0JBQ3ZELE9BQU8sRUFBRSxTQUFTO2dCQUNsQixNQUFNLEVBQUUsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJO2dCQUMvRCxHQUFHLEVBQUUsQ0FBQzthQUNUO1NBQ0osQ0FBQztRQUVGLElBQUksWUFBWSxDQUFDLE9BQU8sRUFBRTtZQUN0QixPQUFPLENBQUMsZUFBZSxHQUFHLFlBQVksQ0FBQyxPQUFPLENBQUM7U0FDbEQ7UUFFRCxJQUFJLFlBQVksQ0FBQyxTQUFTLEVBQUU7WUFDeEIsZ0JBQU0sQ0FBQyxLQUFLLENBQUMseUJBQXlCLFlBQVksQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFD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