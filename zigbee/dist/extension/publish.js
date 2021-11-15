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
const propertyEndpointRegex = new RegExp(`^(.*)_(${utils_1.default.endpointNames.join('|')}|\\d+)$`);
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
        if (definition == null) {
            logger_1.default.error(`Cannot publish to unsupported device '${re.name}'`);
            return;
        }
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
            else {
                converters = definition.toZigbee;
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
                logger_1.default.error(`No converter available for '${key}' (${message[key]})`);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHVibGlzaC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2xpYi9leHRlbnNpb24vcHVibGlzaC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFDQSwyREFBNkM7QUFDN0MsNEZBQWtFO0FBQ2xFLDREQUFvQztBQUNwQywwREFBa0M7QUFDbEMsNERBQW9DO0FBQ3BDLGtIQUE4RDtBQUM5RCwyREFBbUM7QUFDbkMsNkRBQXFDO0FBQ3JDLG9FQUFrQztBQUVsQyxNQUFNLFVBQVUsR0FBRyxJQUFJLE1BQU0sQ0FBQyxjQUFjLGVBQUssQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDO0FBQ3pHLE1BQU0scUJBQXFCLEdBQUcsSUFBSSxNQUFNLENBQUMsVUFBVSxlQUFLLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUM7QUFDM0YsTUFBTSxXQUFXLEdBQUcsQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsUUFBUSxDQUFDLENBQUM7QUFDdkYsTUFBTSxrQkFBa0IsR0FBRyxDQUFDLGFBQWEsRUFBRSxXQUFXLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixDQUFDLENBQUM7QUFFNUYsb0hBQW9IO0FBQ3BILE1BQU0sc0JBQXNCLEdBQUc7SUFDM0Isb0NBQXdCLENBQUMsa0JBQWtCLENBQUMsc0JBQXNCO0lBQ2xFLG9DQUF3QixDQUFDLGtCQUFrQixDQUFDLHFCQUFxQjtJQUNqRSxvQ0FBd0IsQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNO0lBQ2xELG9DQUF3QixDQUFDLGtCQUFrQixDQUFDLGlCQUFpQjtJQUM3RCxvQ0FBd0IsQ0FBQyxrQkFBa0IsQ0FBQyxtQkFBbUI7SUFDL0Qsb0NBQXdCLENBQUMsa0JBQWtCLENBQUMsb0NBQW9D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