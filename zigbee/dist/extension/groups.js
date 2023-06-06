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
        if (data.reason === reason || data.reason === 'publishCached') {
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
                return g.options && (!g.options.hasOwnProperty('optimistic') || g.options.optimistic);
            });
            if (entity instanceof device_1.default) {
                for (const group of groups) {
                    if (group.zh.hasMember(entity.endpoint(endpointName)) &&
                        !(0, es6_1.default)(this.lastOptimisticState[group.ID], payload) &&
                        this.shouldPublishPayloadForGroup(group, payload)) {
                        this.lastOptimisticState[group.ID] = payload;
                        await this.publishEntityState(group, payload, reason);
                    }
                }
            }
            else {
                // Invalidate the last optimistic group state when group state is changed directly.
                delete this.lastOptimisticState[entity.ID];
                const groupsToPublish = new Set();
                for (const member of entity.zh.members) {
                    const device = this.zigbee.resolveEntity(member.getDevice());
                    if (device.options.disabled)
                        continue;
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
                        if (zigbeeGroup.zh.hasMember(member) &&
                            this.shouldPublishPayloadForGroup(zigbeeGroup, payload)) {
                            groupsToPublish.add(zigbeeGroup);
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
    shouldPublishPayloadForGroup(group, payload) {
        if (group.options.off_state === 'last_member_state')
            return true;
        if (!payload || payload.state !== 'OFF')
            return true;
        if (this.areAllMembersOff(group))
            return true;
        return false;
    }
    areAllMembersOff(group) {
        for (const member of group.zh.members) {
            const device = this.zigbee.resolveEntity(member.getDevice());
            if (this.state.exists(device)) {
                const state = this.state.get(device);
                if (state.state === 'ON') {
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
        let changedGroups = [];
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
                    changedGroups.push(resolvedEntityGroup);
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
                    changedGroups.push(resolvedEntityGroup);
                    /* istanbul ignore else */
                    if (settings.get().advanced.legacy_api) {
                        const payload = { friendly_name: resolvedEntityDevice.name, group: resolvedEntityGroup.name };
                        this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `device_group_remove`, message: payload }));
                    }
                }
                else { // remove_all
                    logger_1.default.info(`Removing '${resolvedEntityDevice.name}' from all groups`);
                    changedGroups = this.zigbee.groups().filter((g) => g.zh.members.includes(resolvedEntityEndpoint));
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
            for (const group of changedGroups) {
                this.eventBus.emitGroupMembersChanged({
                    group, action: type, endpoint: resolvedEntityEndpoint, skipDisableReporting
                });
            }
        }
    }
}
exports.default = Groups;
__decorate([
    bind_decorator_1.default
], Groups.prototype, "onStateChange", null);
__decorate([
    bind_decorator_1.default
], Groups.prototype, "onMQTTMessage", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ3JvdXBzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vbGliL2V4dGVuc2lvbi9ncm91cHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDJEQUE2QztBQUM3Qyw0REFBb0M7QUFDcEMsMERBQWtDO0FBQ2xDLGtIQUE4RDtBQUM5RCw4REFBeUM7QUFDekMsb0VBQWtDO0FBQ2xDLDREQUFvQztBQUNwQyw2REFBcUM7QUFDckMsMkRBQW1DO0FBRW5DLE1BQU0sVUFBVSxHQUNaLElBQUksTUFBTSxDQUFDLElBQUksUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLHdEQUF3RCxDQUFDLENBQUM7QUFDM0csTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLE1BQU0sQ0FBQyxJQUFJLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsVUFBVSw2Q0FBNkMsQ0FBQyxDQUFDO0FBQ3JILE1BQU0seUJBQXlCLEdBQUcsSUFBSSxNQUFNLENBQUMsSUFBSSxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFVBQVUsMkJBQTJCLENBQUMsQ0FBQztBQUU1RyxNQUFNLGVBQWUsR0FBK0U7SUFDaEcsT0FBTyxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUk7SUFDbkIsWUFBWSxFQUFFLENBQUMsS0FBSyxFQUFFLE9BQU8sRUFBRSxFQUFFLENBQzdCLENBQUMsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLE9BQU8sSUFBSSxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxZQUFZLENBQUMsQ0FBQztJQUNoRyxZQUFZLEVBQUUsQ0FBQyxLQUFLLEVBQUUsT0FBTyxFQUFFLEVBQUUsQ0FDN0Is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