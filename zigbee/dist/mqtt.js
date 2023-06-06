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
const mqtt_1 = __importDefault(require("mqtt"));
const logger_1 = __importDefault(require("./util/logger"));
const settings = __importStar(require("./util/settings"));
const utils_1 = __importDefault(require("./util/utils"));
const fs_1 = __importDefault(require("fs"));
const bind_decorator_1 = __importDefault(require("bind-decorator"));
class MQTT {
    constructor(eventBus) {
        this.publishedTopics = new Set();
        this.initialConnect = true;
        this.retainedMessages = {};
        this.eventBus = eventBus;
    }
    async connect() {
        const mqttSettings = settings.get().mqtt;
        logger_1.default.info(`Connecting to MQTT server at ${mqttSettings.server}`);
        const options = {
            will: {
                topic: `${settings.get().mqtt.base_topic}/bridge/state`,
                payload: utils_1.default.availabilityPayload('offline', settings.get()),
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
            // @ts-ignore https://github.com/Koenkk/zigbee2mqtt/issues/9822
            this.client.stream.setMaxListeners(0);
            this.eventBus.onPublishAvailability(this, () => this.publishStateOnline());
            const onConnect = this.onConnect;
            this.client.on('connect', async () => {
                await onConnect();
                resolve();
            });
            this.client.on('error', (err) => {
                logger_1.default.error(`MQTT error: ${err.message}`);
                reject(err);
            });
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
        await this.publishStateOnline();
        if (!this.initialConnect) {
            this.republishRetainedTimer = setTimeout(() => {
                // Republish retained messages in case MQTT broker does not persist them.
                // https://github.com/Koenkk/zigbee2mqtt/issues/9629
                Object.values(this.retainedMessages).forEach((e) => this.publish(e.topic, e.payload, e.options, e.base, e.skipLog, e.skipReceive));
            }, 2000);
        }
        this.initialConnect = false;
        this.subscribe(`${settings.get().mqtt.base_topic}/#`);
    }
    async publishStateOnline() {
        await this.publish('bridge/state', utils_1.default.availabilityPayload('online', settings.get()), { retain: true, qos: 0 });
    }
    async disconnect() {
        clearTimeout(this.connectionTimer);
        await this.publish('bridge/state', utils_1.default.availabilityPayload('offline', settings.get()), { retain: true, qos: 0 });
        this.eventBus.removeListeners(this);
        logger_1.default.info('Disconnecting from MQTT server');
        this.client.end();
    }
    subscribe(topic) {
        this.client.subscribe(topic);
    }
    onMessage(topic, message) {
        // Since we subscribe to zigbee2mqtt/# we also receive the message we send ourselves, skip these.
        if (!this.publishedTopics.has(topic)) {
            logger_1.default.debug(`Received MQTT message on '${topic}' with data '${message}'`);
            this.eventBus.emitMQTTMessage({ topic, message: message + '' });
        }
        if (this.republishRetainedTimer && topic == `${settings.get().mqtt.base_topic}/bridge/state`) {
            clearTimeout(this.republishRetainedTimer);
            this.republishRetainedTimer = null;
        }
    }
    isConnected() {
        return this.client && !this.client.reconnecting;
    }
    async publish(topic, payload, options = {}, base = settings.get().mqtt.base_topic, skipLog = false, skipReceive = true) {
        const defaultOptions = { qos: 0, retain: false };
        topic = `${base}/${topic}`;
        if (skipReceive) {
            this.publishedTopics.add(topic);
        }
        if (options.retain) {
            if (payload) {
                this.retainedMessages[topic] =
                    { payload, options, skipReceive, skipLog, topic: topic.substring(base.length + 1), base };
            }
            else {
                delete this.retainedMessages[topic];
            }
        }
        this.eventBus.emitMQTTMessagePublished({ topic, payload, options: { ...defaultOptions, ...options } });
        if (!this.isConnected()) {
            if (!skipLog) {
                logger_1.default.error(`Not connected to MQTT server!`);
                logger_1.default.error(`Cannot send message: topic: '${topic}', payload: '${payload}`);
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
exports.default = MQTT;
__decorate([
    bind_decorator_1.default
], MQTT.prototype, "onConnect", null);
__decorate([
    bind_decorator_1.default
], MQTT.prototype, "onMessage", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibXF0dC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL2xpYi9tcXR0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxnREFBd0I7QUFDeEIsMkRBQW1DO0FBQ25DLDBEQUE0QztBQUM1Qyx5REFBaUM7QUFDakMsNENBQW9CO0FBQ3BCLG9FQUFrQztBQUVsQyxNQUFxQixJQUFJO0lBVXJCLFlBQVksUUFBa0I7UUFUdEIsb0JBQWUsR0FBZ0IsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUl6QyxtQkFBYyxHQUFHLElBQUksQ0FBQztRQUV0QixxQkFBZ0IsR0FDb0QsRUFBRSxDQUFDO1FBRzNFLElBQUksQ0FBQyxRQUFRLEdBQUcsUUFBUSxDQUFDO0lBQzdCLENBQUM7SUFFRCxLQUFLLENBQUMsT0FBTztRQUNULE1BQU0sWUFBWSxHQUFHLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUM7UUFDekMsZ0JBQU0sQ0FBQyxJQUFJLENBQUMsZ0NBQWdDLFlBQVksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBRW5FLE1BQU0sT0FBTyxHQUF3QjtZQUNqQyxJQUFJLEVBQUU7Z0JBQ0YsS0FBSyxFQUFFLEdBQUcsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLGVBQWU7Z0JBQ3ZELE9BQU8sRUFBRSxlQUFLLENBQUMsbUJBQW1CLENBQUMsU0FBUyxFQUFFLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQztnQkFDN0QsTUFBTSxFQUFFLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSTtnQkFDL0QsR0FBRyxFQUFFLENBQUM7YUFDVDtTQUNKLENBQUM7UUFFRixJQUFJLFlBQVksQ0FBQyxPQUFPLEVBQUU7WUFDdEIsT0FBTyxDQUFDLGVBQWUsR0FBRyxZQUFZLENB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