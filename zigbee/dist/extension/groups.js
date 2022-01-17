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
const logger_1 = __importDefault(require("../util/logger"));
const utils_1 = __importDefault(require("../util/utils"));
const json_stable_stringify_without_jsonify_1 = __importDefault(require("json-stable-stringify-without-jsonify"));
const es6_1 = __importDefault(require("fast-deep-equal/es6"));
const bind_decorator_1 = __importDefault(require("bind-decorator"));
const extension_1 = __importDefault(require("./extension"));
const device_1 = __importDefault(require("../model/device"));
const group_1 = __importDefault(require("../model/group"));
const topicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/request/group/members/(remove|add|remove_all)$`);
const legacyTopicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/group/(.+)/(remove|add|remove_all)$`);
const legacyTopicRegexRemoveAll = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/group/remove_all$`);
const stateProperties = {
    'state': () => true,
    'brightness': (value, exposes) => !!exposes.find((e) => e.type === 'light' && e.features.find((f) => f.name === 'brightness')),
    'color_temp': (value, exposes) => !!exposes.find((e) => e.type === 'light' && e.features.find((f) => f.name === 'color_temp')),
    'color': (value, exposes) => !!exposes.find((e) => e.type === 'light' &&
        e.features.find((f) => f.name === 'color_xy' || f.name === 'color_hs')),
    'color_mode': (value, exposes) => !!exposes.find((e) => e.type === 'light' && ((e.features.find((f) => f.name === `color_${value}`)) ||
        (value === 'color_temp' && e.features.find((f) => f.name === 'color_temp')))),
};
class Groups extends extension_1.default {
    constructor() {
        super(...arguments);
        this.legacyApi = settings.get().advanced.legacy_api;
        this.lastOptimisticState = {};
    }
    async start() {
        this.eventBus.onStateChange(this, this.onStateChange);
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
        await this.syncGroupsWithSettings();
    }
    async syncGroupsWithSettings() {
        const settingsGroups = settings.getGroups();
        const zigbeeGroups = this.zigbee.groups();
        const addRemoveFromGroup = async (action, deviceName, groupName, endpoint, group) => {
            try {
                logger_1.default.info(`${action === 'add' ? 'Adding' : 'Removing'} '${deviceName}' to group '${groupName}'`);
                if (action === 'remove') {
                    await endpoint.removeFromGroup(group.zh);
                }
                else {
                    await endpoint.addToGroup(group.zh);
                }
            }
            catch (error) {
                logger_1.default.error(`Failed to ${action} '${deviceName}' from '${groupName}'`);
                logger_1.default.debug(error.stack);
            }
        };
        for (const settingGroup of settingsGroups) {
            const groupID = settingGroup.ID;
            const zigbeeGroup = zigbeeGroups.find((g) => g.ID === groupID) || this.zigbee.createGroup(groupID);
            const settingsEndpoint = settingGroup.devices.map((d) => {
                const parsed = utils_1.default.parseEntityID(d);
                const entity = this.zigbee.resolveEntity(parsed.ID);
                if (!entity)
                    logger_1.default.error(`Cannot find '${d}' of group '${settingGroup.friendly_name}'`);
                return { 'endpoint': entity === null || entity === void 0 ? void 0 : entity.endpoint(parsed.endpoint), 'name': entity === null || entity === void 0 ? void 0 : entity.name };
            }).filter((e) => e.endpoint != null);
            // In settings but not in zigbee
            for (const entity of settingsEndpoint) {
                if (!zigbeeGroup.zh.hasMember(entity.endpoint)) {
                    addRemoveFromGroup('add', entity.name, settingGroup.friendly_name, entity.endpoint, zigbeeGroup);
                }
            }
            // In zigbee but not in settings
            for (const endpoint of zigbeeGroup.zh.members) {
                if (!settingsEndpoint.find((e) => e.endpoint === endpoint)) {
                    const deviceName = settings.getDevice(endpoint.getDevice().ieeeAddr).friendly_name;
                    addRemoveFromGroup('remove', deviceName, settingGroup.friendly_name, endpoint, zigbeeGroup);
                }
            }
        }
        for (const zigbeeGroup of zigbeeGroups) {
            if (!settingsGroups.find((g) => g.ID === zigbeeGroup.ID)) {
                for (const endpoint of zigbeeGroup.zh.members) {
                    const deviceName = settings.getDevice(endpoint.getDevice().ieeeAddr).friendly_name;
                    addRemoveFromGroup('remove', deviceName, zigbeeGroup.ID, endpoint, zigbeeGroup);
                }
            }
        }
    }
    async onStateChange(data) {
        const reason = 'groupOptimistic';
        if (data.reason === reason) {
            return;
        }
        const payload = {};
        let endpointName = null;
        for (let [prop, value] of Object.entries(data.update)) {
            const endpointNameMatch = utils_1.default.endpointNames.find((n) => prop.endsWith(`_${n}`));
            if (endpointNameMatch) {
                prop = prop.substring(0, prop.length - endpointNameMatch.length - 1);
                endpointName = endpointNameMatch;
            }
            if (prop in stateProperties) {
                payload[prop] = value;
            }
        }
        if (Object.keys(payload).length) {
            const entity = data.entity;
            const groups = this.zigbee.groups().filter((g) => {
                return g.settings && (!g.settings.hasOwnProperty('optimistic') || g.settings.optimistic);
            });
            if (entity instanceof device_1.default) {
                for (const group of groups) {
                    if (group.zh.hasMember(entity.endpoint(endpointName)) &&
                        !(0, es6_1.default)(this.lastOptimisticState[group.ID], payload)) {
                        if (!payload || payload.state !== 'OFF' || this.areAllMembersOff(group)) {
                            this.lastOptimisticState[group.ID] = payload;
                            await this.publishEntityState(group, payload, reason);
                        }
                    }
                }
            }
            else {
                // Invalidate the last optimistic group state when group state is changed directly.
                delete this.lastOptimisticState[entity.ID];
                const groupsToPublish = new Set();
                for (const member of entity.zh.members) {
                    const device = this.zigbee.resolveEntity(member.getDevice());
                    const exposes = device.exposes();
                    const memberPayload = {};
                    Object.keys(payload).forEach((key) => {
                        if (stateProperties[key](payload[key], exposes)) {
                            memberPayload[key] = payload[key];
                        }
                    });
                    const endpointName = device.endpointName(member);
                    if (endpointName) {
                        Object.keys(memberPayload).forEach((key) => {
                            memberPayload[`${key}_${endpointName}`] = memberPayload[key];
                            delete memberPayload[key];
                        });
                    }
                    await this.publishEntityState(device, memberPayload, reason);
                    for (const zigbeeGroup of groups) {
                        if (zigbeeGroup.zh.hasMember(member)) {
                            if (!payload || payload.state !== 'OFF' || this.areAllMembersOff(zigbeeGroup)) {
                                groupsToPublish.add(zigbeeGroup);
                            }
                        }
                    }
                }
                groupsToPublish.delete(entity);
                for (const group of groupsToPublish) {
                    await this.publishEntityState(group, payload, reason);
                }
            }
        }
    }
    areAllMembersOff(group) {
        for (const member of group.zh.members) {
            const device = this.zigbee.resolveEntity(member.getDevice());
            if (this.state.exists(device)) {
                const state = this.state.get(device);
                if (state && state.state === 'ON') {
                    return false;
                }
            }
        }
        return true;
    }
    parseMQTTMessage(data) {
        let type = null;
        let resolvedEntityGroup = null;
        let resolvedEntityDevice = null;
        let resolvedEntityEndpoint = null;
        let error = null;
        let groupKey = null;
        let deviceKey = null;
        let triggeredViaLegacyApi = false;
        let skipDisableReporting = false;
        /* istanbul ignore else */
        const topicRegexMatch = data.topic.match(topicRegex);
        const legacyTopicRegexRemoveAllMatch = data.topic.match(legacyTopicRegexRemoveAll);
        const legacyTopicRegexMatch = data.topic.match(legacyTopicRegex);
        if (this.legacyApi && (legacyTopicRegexMatch || legacyTopicRegexRemoveAllMatch)) {
            triggeredViaLegacyApi = true;
            if (legacyTopicRegexMatch) {
                resolvedEntityGroup = this.zigbee.resolveEntity(legacyTopicRegexMatch[1]);
                type = legacyTopicRegexMatch[2];
                if (!resolvedEntityGroup || !(resolvedEntityGroup instanceof group_1.default)) {
                    logger_1.default.error(`Group '${legacyTopicRegexMatch[1]}' does not exist`);
                    /* istanbul ignore else */
                    if (settings.get().advanced.legacy_api) {
                        const payload = { friendly_name: data.message,
                            group: legacyTopicRegexMatch[1], error: 'group doesn\'t exists' };
                        this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `device_group_${type}_failed`, message: payload }));
                    }
                    return null;
                }
            }
            else {
                type = 'remove_all';
            }
            const parsedEntity = utils_1.default.parseEntityID(data.message);
            resolvedEntityDevice = this.zigbee.resolveEntity(parsedEntity.ID);
            if (!resolvedEntityDevice || !(resolvedEntityDevice instanceof device_1.default)) {
                logger_1.default.error(`Device '${data.message}' does not exist`);
                /* istanbul ignore else */
                if (settings.get().advanced.legacy_api) {
                    const payload = {
                        friendly_name: data.message, group: legacyTopicRegexMatch[1], error: 'entity doesn\'t exists',
                    };
                    this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `device_group_${type}_failed`, message: payload }));
                }
                return null;
            }
            resolvedEntityEndpoint = resolvedEntityDevice.endpoint(parsedEntity.endpoint);
        }
        else if (topicRegexMatch) {
            type = topicRegexMatch[1];
            const message = JSON.parse(data.message);
            deviceKey = message.device;
            skipDisableReporting = 'skip_disable_reporting' in message ? message.skip_disable_reporting : false;
            if (type !== 'remove_all') {
                groupKey = message.group;
                resolvedEntityGroup = this.zigbee.resolveEntity(message.group);
                if (!resolvedEntityGroup || !(resolvedEntityGroup instanceof group_1.default)) {
                    error = `Group '${message.group}' does not exist`;
                }
            }
            const parsed = utils_1.default.parseEntityID(message.device);
            resolvedEntityDevice = this.zigbee.resolveEntity(parsed.ID);
            if (!error && (!resolvedEntityDevice || !(resolvedEntityDevice instanceof device_1.default))) {
                error = `Device '${message.device}' does not exist`;
            }
            if (!error) {
                resolvedEntityEndpoint = resolvedEntityDevice.endpoint(parsed.endpoint);
            }
        }
        return {
            resolvedEntityGroup, resolvedEntityDevice, type, error, groupKey, deviceKey,
            triggeredViaLegacyApi, skipDisableReporting, resolvedEntityEndpoint,
        };
    }
    async onMQTTMessage(data) {
        const parsed = this.parseMQTTMessage(data);
        if (!parsed || !parsed.type)
            return;
        let { resolvedEntityGroup, resolvedEntityDevice, type, error, triggeredViaLegacyApi, groupKey, deviceKey, skipDisableReporting, resolvedEntityEndpoint, } = parsed;
        const message = utils_1.default.parseJSON(data.message, data.message);
        const responseData = { device: deviceKey };
        if (groupKey) {
            responseData.group = groupKey;
        }
        if (!error) {
            try {
                const keys = [
                    `${resolvedEntityDevice.ieeeAddr}/${resolvedEntityEndpoint.ID}`,
                    `${resolvedEntityDevice.name}/${resolvedEntityEndpoint.ID}`,
                ];
                const endpointNameLocal = resolvedEntityDevice.endpointName(resolvedEntityEndpoint);
                if (endpointNameLocal) {
                    keys.push(`${resolvedEntityDevice.ieeeAddr}/${endpointNameLocal}`);
                    keys.push(`${resolvedEntityDevice.name}/${endpointNameLocal}`);
                }
                if (!endpointNameLocal) {
                    keys.push(resolvedEntityDevice.name);
                    keys.push(resolvedEntityDevice.ieeeAddr);
                }
                if (type === 'add') {
                    logger_1.default.info(`Adding '${resolvedEntityDevice.name}' to '${resolvedEntityGroup.name}'`);
                    await resolvedEntityEndpoint.addToGroup(resolvedEntityGroup.zh);
                    settings.addDeviceToGroup(resolvedEntityGroup.ID.toString(), keys);
                    /* istanbul ignore else */
                    if (settings.get().advanced.legacy_api) {
                        const payload = { friendly_name: resolvedEntityDevice.name, group: resolvedEntityGroup.name };
                        this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `device_group_add`, message: payload }));
                    }
                }
                else if (type === 'remove') {
                    logger_1.default.info(`Removing '${resolvedEntityDevice.name}' from '${resolvedEntityGroup.name}'`);
                    await resolvedEntityEndpoint.removeFromGroup(resolvedEntityGroup.zh);
                    settings.removeDeviceFromGroup(resolvedEntityGroup.ID.toString(), keys);
                    /* istanbul ignore else */
                    if (settings.get().advanced.legacy_api) {
                        const payload = { friendly_name: resolvedEntityDevice.name, group: resolvedEntityGroup.name };
                        this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `device_group_remove`, message: payload }));
                    }
                }
                else { // remove_all
                    logger_1.default.info(`Removing '${resolvedEntityDevice.name}' from all groups`);
                    await resolvedEntityEndpoint.removeFromAllGroups();
                    for (const settingsGroup of settings.getGroups()) {
                        settings.removeDeviceFromGroup(settingsGroup.ID.toString(), keys);
                        /* istanbul ignore else */
                        if (settings.get().advanced.legacy_api) {
                            const payload = { friendly_name: resolvedEntityDevice.name };
                            this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `device_group_remove_all`, message: payload }));
                        }
                    }
                }
            }
            catch (e) {
                error = `Failed to ${type} from group (${e.message})`;
                logger_1.default.debug(e.stack);
            }
        }
        if (!triggeredViaLegacyApi) {
            const response = utils_1.default.getResponse(message, responseData, error);
            await this.mqtt.publish(`bridge/response/group/members/${type}`, (0, json_stable_stringify_without_jsonify_1.default)(response));
        }
        if (error) {
            logger_1.default.error(error);
        }
        else {
            this.eventBus.emitGroupMembersChanged({
                group: resolvedEntityGroup, action: type, endpoint: resolvedEntityEndpoint, skipDisableReporting
            });
        }
    }
}
__decorate([
    bind_decorator_1.default
], Groups.prototype, "onStateChange", null);
__decorate([
    bind_decorator_1.default
], Groups.prototype, "onMQTTMessage", null);
exports.default = Groups;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ3JvdXBzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vbGliL2V4dGVuc2lvbi9ncm91cHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsMkRBQTZDO0FBQzdDLDREQUFvQztBQUNwQywwREFBa0M7QUFDbEMsa0hBQThEO0FBQzlELDhEQUF5QztBQUN6QyxvRUFBa0M7QUFDbEMsNERBQW9DO0FBQ3BDLDZEQUFxQztBQUNyQywyREFBbUM7QUFFbkMsTUFBTSxVQUFVLEdBQ1osSUFBSSxNQUFNLENBQUMsSUFBSSxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFVBQVUsd0RBQXdELENBQUMsQ0FBQztBQUMzRyxNQUFNLGdCQUFnQixHQUFHLElBQUksTUFBTSxDQUFDLElBQUksUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLDZDQUE2QyxDQUFDLENBQUM7QUFDckgsTUFBTSx5QkFBeUIsR0FBRyxJQUFJLE1BQU0sQ0FBQyxJQUFJLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsVUFBVSwyQkFBMkIsQ0FBQyxDQUFDO0FBRTVHLE1BQU0sZUFBZSxHQUErRTtJQUNoRyxPQUFPLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSTtJQUNuQixZQUFZLEVBQUUsQ0FBQyxLQUFLLEVBQUUsT0FBTyxFQUFFLEVBQUUsQ0FDN0IsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssT0FBTyxJQUFJLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLFlBQVksQ0FBQyxDQUFDO0lBQ2hHLFlBQVksRUFBRSxDQUFDLEtBQUssRUFBRSxPQUFPLEVBQUUsRUFBRSxDQUM3QixDQUFD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