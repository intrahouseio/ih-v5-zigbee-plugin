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
const settings = __importStar(require("../util/settings"));
const zigbee_herdsman_converters_1 = __importDefault(require("zigbee-herdsman-converters"));
const philips_1 = __importDefault(require("zigbee-herdsman-converters/lib/philips"));
const logger_1 = __importDefault(require("../util/logger"));
const utils_1 = __importDefault(require("../util/utils"));
const extension_1 = __importDefault(require("./extension"));
const json_stable_stringify_without_jsonify_1 = __importDefault(require("json-stable-stringify-without-jsonify"));
const group_1 = __importDefault(require("../model/group"));
const device_1 = __importDefault(require("../model/device"));
const bind_decorator_1 = __importDefault(require("bind-decorator"));
const topicRegex = new RegExp(`^(.+?)(?:/(${utils_1.default.endpointNames.join('|')}|\\d+))?/(get|set)(?:/(.+))?`);
const propertyEndpointRegex = new RegExp(`^(.*?)_(${utils_1.default.endpointNames.join('|')})$`);
const stateValues = ['on', 'off', 'toggle', 'open', 'close', 'stop', 'lock', 'unlock'];
const sceneConverterKeys = ['scene_store', 'scene_add', 'scene_remove', 'scene_remove_all'];
// Legacy: don't provide default converters anymore, this is required by older z2m installs not saving group members
const defaultGroupConverters = [
    zigbee_herdsman_converters_1.default.toZigbeeConverters.light_onoff_brightness,
    zigbee_herdsman_converters_1.default.toZigbeeConverters.light_color_colortemp,
    philips_1.default.tz.effect,
    zigbee_herdsman_converters_1.default.toZigbeeConverters.ignore_transition,
    zigbee_herdsman_converters_1.default.toZigbeeConverters.cover_position_tilt,
    zigbee_herdsman_converters_1.default.toZigbeeConverters.thermostat_occupied_heating_setpoint,
    zigbee_herdsman_converters_1.default.toZigbeeConverters.tint_scene,
    zigbee_herdsman_converters_1.default.toZigbeeConverters.light_brightness_move,
    zigbee_herdsman_converters_1.default.toZigbeeConverters.light_brightness_step,
    zigbee_herdsman_converters_1.default.toZigbeeConverters.light_colortemp_step,
    zigbee_herdsman_converters_1.default.toZigbeeConverters.light_colortemp_move,
    zigbee_herdsman_converters_1.default.toZigbeeConverters.light_hue_saturation_move,
    zigbee_herdsman_converters_1.default.toZigbeeConverters.light_hue_saturation_step,
];
class Publish extends extension_1.default {
    async start() {
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
    }
    parseTopic(topic) {
        const match = topic.match(topicRegex);
        if (!match) {
            return null;
        }
        const ID = match[1].replace(`${settings.get().mqtt.base_topic}/`, '');
        // If we didn't replace base_topic we received something we don't care about
        if (ID === match[1] || ID.match(/bridge/)) {
            return null;
        }
        return { ID: ID, endpoint: match[2], type: match[3], attribute: match[4] };
    }
    parseMessage(parsedTopic, data) {
        if (parsedTopic.attribute) {
            try {
                return { [parsedTopic.attribute]: JSON.parse(data.message) };
            }
            catch (e) {
                return { [parsedTopic.attribute]: data.message };
            }
        }
        else {
            try {
                return JSON.parse(data.message);
            }
            catch (e) {
                if (stateValues.includes(data.message.toLowerCase())) {
                    return { state: data.message };
                }
                else {
                    return null;
                }
            }
        }
    }
    legacyLog(payload) {
        /* istanbul ignore else */
        if (settings.get().advanced.legacy_api) {
            this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)(payload));
        }
    }
    legacyRetrieveState(re, converter, result, target, key, meta) {
        // It's possible for devices to get out of sync when writing an attribute that's not reportable.
        // So here we re-read the value after a specified timeout, this timeout could for example be the
        // transition time of a color change or for forcing a state read for devices that don't
        // automatically report a new state when set.
        // When reporting is requested for a device (report: true in device-specific settings) we won't
        // ever issue a read here, as we assume the device will properly report changes.
        // Only do this when the retrieve_state option is enabled for this device.
        // retrieve_state == deprecated
        if (re instanceof device_1.default && result && result.hasOwnProperty('readAfterWriteTime') &&
            re.options.retrieve_state) {
            setTimeout(() => converter.convertGet(target, key, meta), result.readAfterWriteTime);
        }
    }
    updateMessageHomeAssistant(message, entityState) {
        /**
         * Home Assistant always publishes 'state', even when e.g. only setting
         * the color temperature. This would lead to 2 zigbee publishes, where the first one
         * (state) is probably unnecessary.
         */
        if (settings.get().homeassistant) {
            const hasColorTemp = message.hasOwnProperty('color_temp');
            const hasColor = message.hasOwnProperty('color');
            const hasBrightness = message.hasOwnProperty('brightness');
            const isOn = entityState.state === 'ON' ? true : false;
            if (isOn && (hasColorTemp || hasColor) && !hasBrightness) {
                delete message.state;
                logger_1.default.debug('Skipping state because of Home Assistant');
            }
        }
    }
    async onMQTTMessage(data) {
        const parsedTopic = this.parseTopic(data.topic);
        if (!parsedTopic)
            return;
        const re = this.zigbee.resolveEntity(parsedTopic.ID);
        if (re == null) {
            this.legacyLog({ type: `entity_not_found`, message: { friendly_name: parsedTopic.ID } });
            logger_1.default.error(`Entity '${parsedTopic.ID}' is unknown`);
            return;
        }
        // Get entity details
        const definition = re instanceof device_1.default ? re.definition : re.membersDefinitions();
        const target = re instanceof group_1.default ? re.zh : re.endpoint(parsedTopic.endpoint);
        if (target == null) {
            logger_1.default.error(`Device '${re.name}' has no endpoint '${parsedTopic.endpoint}'`);
            return;
        }
        const device = re instanceof device_1.default ? re.zh : null;
        const entitySettings = re.options;
        const entityState = this.state.get(re);
        const membersState = re instanceof group_1.default ?
            Object.fromEntries(re.zh.members.map((e) => [e.getDevice().ieeeAddr,
                this.state.get(this.zigbee.resolveEntity(e.getDevice().ieeeAddr))])) : null;
        let converters;
        {
            if (Array.isArray(definition)) {
                const c = new Set(definition.map((d) => d.toZigbee).flat());
                if (c.size == 0)
                    converters = defaultGroupConverters;
                else
                    converters = Array.from(c);
            }
            else if (definition) {
                converters = definition.toZigbee;
            }
            else {
                converters = [zigbee_herdsman_converters_1.default.toZigbeeConverters.read,
                    zigbee_herdsman_converters_1.default.toZigbeeConverters.write];
            }
        }
        // Convert the MQTT message to a Zigbee message.
        const message = this.parseMessage(parsedTopic, data);
        if (message == null) {
            logger_1.default.error(`Invalid message '${message}', skipping...`);
            return;
        }
        this.updateMessageHomeAssistant(message, entityState);
        /**
         * Order state & brightness based on current bulb state
         *
         * Not all bulbs support setting the color/color_temp while it is off
         * this results in inconsistent behavior between different vendors.
         *
         * bulb on => move state & brightness to the back
         * bulb off => move state & brightness to the front
         */
        const entries = Object.entries(message);
        const sorter = typeof message.state === 'string' && message.state.toLowerCase() === 'off' ? 1 : -1;
        entries.sort((a) => (['state', 'brightness', 'brightness_percent'].includes(a[0]) ? sorter : sorter * -1));
        // For each attribute call the corresponding converter
        const usedConverters = {};
        const toPublish = {};
        const toPublishEntity = {};
        const addToToPublish = (entity, payload) => {
            const ID = entity.ID;
            if (!(ID in toPublish)) {
                toPublish[ID] = {};
                toPublishEntity[ID] = entity;
            }
            toPublish[ID] = { ...toPublish[ID], ...payload };
        };
        for (let [key, value] of entries) {
            let endpointName = parsedTopic.endpoint;
            let localTarget = target;
            let endpointOrGroupID = utils_1.default.isEndpoint(target) ? target.ID : target.groupID;
            // When the key has a endpointName included (e.g. state_right), this will override the target.
            const propertyEndpointMatch = key.match(propertyEndpointRegex);
            if (re instanceof device_1.default && propertyEndpointMatch) {
                endpointName = propertyEndpointMatch[2];
                key = propertyEndpointMatch[1];
                localTarget = re.endpoint(endpointName);
                if (localTarget == null) {
                    logger_1.default.error(`Device '${re.name}' has no endpoint '${endpointName}'`);
                    continue;
                }
                endpointOrGroupID = localTarget.ID;
            }
            if (!usedConverters.hasOwnProperty(endpointOrGroupID))
                usedConverters[endpointOrGroupID] = [];
            const converter = converters.find((c) => c.key.includes(key));
            if (parsedTopic.type === 'set' && usedConverters[endpointOrGroupID].includes(converter)) {
                // Use a converter for set only once
                // (e.g. light_onoff_brightness converters can convert state and brightness)
                continue;
            }
            if (!converter) {
                logger_1.default.error(`No converter available for '${key}' (${(0, json_stable_stringify_without_jsonify_1.default)(message[key])})`);
                continue;
            }
            // If the endpoint_name name is a number, try to map it to a friendlyName
            if (!isNaN(Number(endpointName)) && re.isDevice() && utils_1.default.isEndpoint(localTarget) &&
                re.endpointName(localTarget)) {
                endpointName = re.endpointName(localTarget);
            }
            // Converter didn't return a result, skip
            const meta = { endpoint_name: endpointName, options: entitySettings, message: { ...message }, logger: logger_1.default, device,
                state: entityState, membersState, mapped: definition };
            // Strip endpoint name from meta.message properties.
            if (endpointName) {
                for (const [key, value] of Object.entries(meta.message)) {
                    if (key.endsWith(endpointName)) {
                        delete meta.message[key];
                        const keyWithoutEndpoint = key.substring(0, key.length - endpointName.length - 1);
                        meta.message[keyWithoutEndpoint] = value;
                    }
                }
            }
            try {
                if (parsedTopic.type === 'set' && converter.convertSet) {
                    logger_1.default.debug(`Publishing '${parsedTopic.type}' '${key}' to '${re.name}'`);
                    const result = await converter.convertSet(localTarget, key, value, meta);
                    const optimistic = !entitySettings.hasOwnProperty('optimistic') || entitySettings.optimistic;
                    if (result && result.state && optimistic) {
                        const msg = result.state;
                        if (endpointName) {
                            for (const key of Object.keys(msg)) {
                                msg[`${key}_${endpointName}`] = msg[key];
                                delete msg[key];
                            }
                        }
                        // filter out attribute listed in filtered_optimistic
                        utils_1.default.filterProperties(entitySettings.filtered_optimistic, msg);
                        addToToPublish(re, msg);
                    }
                    if (result && result.membersState && optimistic) {
                        for (const [ieeeAddr, state] of Object.entries(result.membersState)) {
                            addToToPublish(this.zigbee.resolveEntity(ieeeAddr), state);
                        }
                    }
                    this.legacyRetrieveState(re, converter, result, localTarget, key, meta);
                }
                else if (parsedTopic.type === 'get' && converter.convertGet) {
                    logger_1.default.debug(`Publishing get '${parsedTopic.type}' '${key}' to '${re.name}'`);
                    await converter.convertGet(localTarget, key, meta);
                }
                else {
                    logger_1.default.error(`No converter available for '${parsedTopic.type}' '${key}' (${message[key]})`);
                    continue;
                }
            }
            catch (error) {
                const message = `Publish '${parsedTopic.type}' '${key}' to '${re.name}' failed: '${error}'`;
                logger_1.default.error(message);
                logger_1.default.debug(error.stack);
                this.legacyLog({ type: `zigbee_publish_error`, message, meta: { friendly_name: re.name } });
            }
            usedConverters[endpointOrGroupID].push(converter);
        }
        for (const [ID, payload] of Object.entries(toPublish)) {
            if (Object.keys(payload).length != 0) {
                this.publishEntityState(toPublishEntity[ID], payload);
            }
        }
        const scenesChanged = Object.values(usedConverters)
            .some((cl) => cl.some((c) => c.key.some((k) => sceneConverterKeys.includes(k))));
        if (scenesChanged) {
            this.eventBus.emitScenesChanged();
        }
    }
}
exports.default = Publish;
__decorate([
    bind_decorator_1.default
], Publish.prototype, "onMQTTMessage", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHVibGlzaC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2xpYi9leHRlbnNpb24vcHVibGlzaC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQ0EsMkRBQTZDO0FBQzdDLDRGQUFrRTtBQUNsRSxxRkFBNkQ7QUFDN0QsNERBQW9DO0FBQ3BDLDBEQUFrQztBQUNsQyw0REFBb0M7QUFDcEMsa0hBQThEO0FBQzlELDJEQUFtQztBQUNuQyw2REFBcUM7QUFDckMsb0VBQWtDO0FBRWxDLE1BQU0sVUFBVSxHQUFHLElBQUksTUFBTSxDQUFDLGNBQWMsZUFBSyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLDhCQUE4QixDQUFDLENBQUM7QUFDekcsTUFBTSxxQkFBcUIsR0FBRyxJQUFJLE1BQU0sQ0FBQyxXQUFXLGVBQUssQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUN2RixNQUFNLFdBQVcsR0FBRyxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxRQUFRLENBQUMsQ0FBQztBQUN2RixNQUFNLGtCQUFrQixHQUFHLENBQUMsYUFBYSxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztBQUU1RixvSEFBb0g7QUFDcEgsTUFBTSxzQkFBc0IsR0FBRztJQUMzQixvQ0FBd0IsQ0FBQyxrQkFBa0IsQ0FBQyxzQkFBc0I7SUFDbEUsb0NBQXdCLENBQUMsa0JBQWtCLENBQUMscUJBQXFCO0lBQ2pFLGlCQUFPLENBQUMsRUFBRSxDQUFDLE1BQU07SUFDakIsb0NBQXdCLENBQUMsa0JBQWtCLENBQUMsaUJBQWlCO0lBQzdELG9DQUF3QixDQUFDLGtCQUFrQixDQUFDLG1CQUFtQjtJQUMvRCxvQ0FBd0IsQ0FBQyxrQkFB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