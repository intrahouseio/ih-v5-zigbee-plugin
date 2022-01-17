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
const settings = __importStar(require("../util/settings"));
const zigbee_herdsman_converters_1 = __importDefault(require("zigbee-herdsman-converters"));
const logger_1 = __importDefault(require("../util/logger"));
const utils_1 = __importDefault(require("../util/utils"));
const extension_1 = __importDefault(require("./extension"));
const json_stable_stringify_without_jsonify_1 = __importDefault(require("json-stable-stringify-without-jsonify"));
const group_1 = __importDefault(require("../model/group"));
const device_1 = __importDefault(require("../model/device"));
const bind_decorator_1 = __importDefault(require("bind-decorator"));
const topicRegex = new RegExp(`^(.+?)(?:/(${utils_1.default.endpointNames.join('|')}|\\d+))?/(get|set)(?:/(.+))?`);
const propertyEndpointRegex = new RegExp(`^(.*)_(${utils_1.default.endpointNames.join('|')})$`);
const stateValues = ['on', 'off', 'toggle', 'open', 'close', 'stop', 'lock', 'unlock'];
const sceneConverterKeys = ['scene_store', 'scene_add', 'scene_remove', 'scene_remove_all'];
// Legacy: don't provide default converters anymore, this is required by older z2m installs not saving group members
const defaultGroupConverters = [
    zigbee_herdsman_converters_1.default.toZigbeeConverters.light_onoff_brightness,
    zigbee_herdsman_converters_1.default.toZigbeeConverters.light_color_colortemp,
    zigbee_herdsman_converters_1.default.toZigbeeConverters.effect,
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
        // retrieve_state == decprecated
        if (re instanceof device_1.default && result && result.hasOwnProperty('readAfterWriteTime') &&
            re.settings.retrieve_state) {
            setTimeout(() => converter.convertGet(target, key, meta), result.readAfterWriteTime);
        }
    }
    updateMessageHomeAssistant(message, entityState) {
        /**
         * Home Assistant always publishes 'state', even when e.g. only setting
         * the color temperature. This would lead to 2 zigbee publishes, where the first one
         * (state) is probably unecessary.
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
        var _a;
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
        const entitySettings = re.settings;
        const entityState = this.state.get(re) || {};
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
         * this results in inconsistant behavior between different vendors.
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
            // If the endpoint_name name is a nubmer, try to map it to a friendlyName
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
                        (_a = entitySettings.filtered_optimistic) === null || _a === void 0 ? void 0 : _a.forEach((a) => delete msg[a]);
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
__decorate([
    bind_decorator_1.default
], Publish.prototype, "onMQTTMessage", null);
exports.default = Publish;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHVibGlzaC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2xpYi9leHRlbnNpb24vcHVibGlzaC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFDQSwyREFBNkM7QUFDN0MsNEZBQWtFO0FBQ2xFLDREQUFvQztBQUNwQywwREFBa0M7QUFDbEMsNERBQW9DO0FBQ3BDLGtIQUE4RDtBQUM5RCwyREFBbUM7QUFDbkMsNkRBQXFDO0FBQ3JDLG9FQUFrQztBQUVsQyxNQUFNLFVBQVUsR0FBRyxJQUFJLE1BQU0sQ0FBQyxjQUFjLGVBQUssQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDO0FBQ3pHLE1BQU0scUJBQXFCLEdBQUcsSUFBSSxNQUFNLENBQUMsVUFBVSxlQUFLLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDdEYsTUFBTSxXQUFXLEdBQUcsQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsUUFBUSxDQUFDLENBQUM7QUFDdkYsTUFBTSxrQkFBa0IsR0FBRyxDQUFDLGFBQWEsRUFBRSxXQUFXLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixDQUFDLENBQUM7QUFFNUYsb0hBQW9IO0FBQ3BILE1BQU0sc0JBQXNCLEdBQUc7SUFDM0Isb0NBQXdCLENBQUMsa0JBQWtCLENBQUMsc0JBQXNCO0lBQ2xFLG9DQUF3QixDQUFDLGtCQUFrQixDQUFDLHFCQUFxQjtJQUNqRSxvQ0FBd0IsQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNO0lBQ2xELG9DQUF3QixDQUFDLGtCQUFrQixDQUFDLGlCQUFpQjtJQUM3RCxvQ0FBd0IsQ0FBQyxrQkFBa0IsQ0FBQyxtQkFBbUI7SUFDL0Qsb0NBQXdCLENBQUMsa0JBQWtCLENBQUMsb0NBQW9D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