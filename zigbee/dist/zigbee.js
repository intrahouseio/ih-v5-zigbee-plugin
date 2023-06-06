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
const zigbee_herdsman_1 = require("zigbee-herdsman");
const logger_1 = __importDefault(require("./util/logger"));
const settings = __importStar(require("./util/settings"));
const data_1 = __importDefault(require("./util/data"));
const utils_1 = __importDefault(require("./util/utils"));
const object_assign_deep_1 = __importDefault(require("object-assign-deep"));
const json_stable_stringify_without_jsonify_1 = __importDefault(require("json-stable-stringify-without-jsonify"));
const device_1 = __importDefault(require("./model/device"));
const group_1 = __importDefault(require("./model/group"));
const bind_decorator_1 = __importDefault(require("bind-decorator"));
class Zigbee {
    constructor(eventBus) {
        this.groupLookup = {};
        this.deviceLookup = {};
        this.eventBus = eventBus;
    }
    async start() {
        const infoHerdsman = await utils_1.default.getDependencyVersion('zigbee-herdsman');
        logger_1.default.info(`Starting zigbee-herdsman (${infoHerdsman.version})`);
        const herdsmanSettings = {
            network: {
                panID: settings.get().advanced.pan_id === 'GENERATE' ?
                    this.generatePanID() : settings.get().advanced.pan_id,
                extendedPanID: settings.get().advanced.ext_pan_id,
                channelList: [settings.get().advanced.channel],
                networkKey: settings.get().advanced.network_key === 'GENERATE' ?
                    this.generateNetworkKey() : settings.get().advanced.network_key,
            },
            databasePath: data_1.default.joinPath('database.db'),
            databaseBackupPath: data_1.default.joinPath('database.db.backup'),
            backupPath: data_1.default.joinPath('coordinator_backup.json'),
            serialPort: {
                baudRate: settings.get().serial.baudrate,
                rtscts: settings.get().serial.rtscts,
                path: settings.get().serial.port,
                adapter: settings.get().serial.adapter,
            },
            adapter: {
                concurrent: settings.get().advanced.adapter_concurrent,
                delay: settings.get().advanced.adapter_delay,
                disableLED: settings.get().serial.disable_led,
            },
            acceptJoiningDeviceHandler: this.acceptJoiningDeviceHandler,
        };
        const herdsmanSettingsLog = (0, object_assign_deep_1.default)({}, herdsmanSettings, { network: { networkKey: 'HIDDEN' } });
        logger_1.default.debug(`Using zigbee-herdsman with settings: '${(0, json_stable_stringify_without_jsonify_1.default)(herdsmanSettingsLog)}'`);
        let startResult;
        try {
            this.herdsman = new zigbee_herdsman_1.Controller(herdsmanSettings, logger_1.default);
            startResult = await this.herdsman.start();
        }
        catch (error) {
            logger_1.default.error(`Error while starting zigbee-herdsman`);
            throw error;
        }
        this.herdsman.on('adapterDisconnected', () => this.eventBus.emitAdapterDisconnected());
        this.herdsman.on('lastSeenChanged', (data) => {
            this.eventBus.emitLastSeenChanged({ device: this.resolveDevice(data.device.ieeeAddr), reason: data.reason });
        });
        this.herdsman.on('permitJoinChanged', (data) => {
            this.eventBus.emitPermitJoinChanged(data);
        });
        this.herdsman.on('deviceNetworkAddressChanged', (data) => {
            const device = this.resolveDevice(data.device.ieeeAddr);
            logger_1.default.debug(`Device '${device.name}' changed network address`);
            this.eventBus.emitDeviceNetworkAddressChanged({ device });
        });
        this.herdsman.on('deviceAnnounce', (data) => {
            const device = this.resolveDevice(data.device.ieeeAddr);
            logger_1.default.debug(`Device '${device.name}' announced itself`);
            this.eventBus.emitDeviceAnnounce({ device });
        });
        this.herdsman.on('deviceInterview', (data) => {
            const device = this.resolveDevice(data.device.ieeeAddr);
            /* istanbul ignore if */ if (!device)
                return; // Prevent potential race
            const d = { device, status: data.status };
            this.logDeviceInterview(d);
            this.eventBus.emitDeviceInterview(d);
        });
        this.herdsman.on('deviceJoined', (data) => {
            const device = this.resolveDevice(data.device.ieeeAddr);
            /* istanbul ignore if */ if (!device)
                return; // Prevent potential race
            logger_1.default.info(`Device '${device.name}' joined`);
            this.eventBus.emitDeviceJoined({ device });
        });
        this.herdsman.on('deviceLeave', (data) => {
            var _a;
            const name = ((_a = settings.getDevice(data.ieeeAddr)) === null || _a === void 0 ? void 0 : _a.friendly_name) || data.ieeeAddr;
            logger_1.default.warn(`Device '${name}' left the network`);
            this.eventBus.emitDeviceLeave({ ieeeAddr: data.ieeeAddr, name });
        });
        this.herdsman.on('message', (data) => {
            const device = this.resolveDevice(data.device.ieeeAddr);
            logger_1.default.debug(`Received Zigbee message from '${device.name}', type '${data.type}', ` +
                `cluster '${data.cluster}', data '${(0, json_stable_stringify_without_jsonify_1.default)(data.data)}' from endpoint ${data.endpoint.ID}` +
                (data.hasOwnProperty('groupID') ? ` with groupID ${data.groupID}` : ``) +
                (device.zh.type === 'Coordinator' ? `, ignoring since it is from coordinator` : ``));
            if (device.zh.type === 'Coordinator')
                return;
            this.eventBus.emitDeviceMessage({ ...data, device });
        });
        logger_1.default.info(`zigbee-herdsman started (${startResult})`);
        logger_1.default.info(`Coordinator firmware version: '${(0, json_stable_stringify_without_jsonify_1.default)(await this.getCoordinatorVersion())}'`);
        logger_1.default.debug(`Zigbee network parameters: ${(0, json_stable_stringify_without_jsonify_1.default)(await this.herdsman.getNetworkParameters())}`);
        for (const device of this.devices(false)) {
            // If a passlist is used, all other device will be removed from the network.
            const passlist = settings.get().passlist;
            const blocklist = settings.get().blocklist;
            const remove = async (device) => {
                try {
                    await device.zh.removeFromNetwork();
                }
                catch (error) {
                    logger_1.default.error(`Failed to remove '${device.ieeeAddr}' (${error.message})`);
                }
            };
            if (passlist.length > 0) {
                if (!passlist.includes(device.ieeeAddr)) {
                    logger_1.default.warn(`Device which is not on passlist connected (${device.ieeeAddr}), removing...`);
                    await remove(device);
                }
            }
            else if (blocklist.includes(device.ieeeAddr)) {
                logger_1.default.warn(`Device on blocklist is connected (${device.ieeeAddr}), removing...`);
                await remove(device);
            }
        }
        // Check if we have to set a transmit power
        if (settings.get().advanced.hasOwnProperty('transmit_power')) {
            const transmitPower = settings.get().advanced.transmit_power;
            await this.herdsman.setTransmitPower(transmitPower);
            logger_1.default.info(`Set transmit power to '${transmitPower}'`);
        }
        return startResult;
    }
    logDeviceInterview(data) {
        const name = data.device.name;
        if (data.status === 'successful') {
            logger_1.default.info(`Successfully interviewed '${name}', device has successfully been paired`);
            if (data.device.definition) {
                const { vendor, description, model } = data.device.definition;
                logger_1.default.info(`Device '${name}' is supported, identified as: ${vendor} ${description} (${model})`);
            }
            else {
                logger_1.default.warn(`Device '${name}' with Zigbee model '${data.device.zh.modelID}' and manufacturer name ` +
                    `'${data.device.zh.manufacturerName}' is NOT supported, ` +
                    // eslint-disable-next-line max-len
                    `please follow https://www.zigbee2mqtt.io/advanced/support-new-devices/01_support_new_devices.html`);
            }
        }
        else if (data.status === 'failed') {
            logger_1.default.error(`Failed to interview '${name}', device has not successfully been paired`);
        }
        else { // data.status === 'started'
            logger_1.default.info(`Starting interview of '${name}'`);
        }
    }
    generateNetworkKey() {
        const key = Array.from({ length: 16 }, () => Math.floor(Math.random() * 255));
        settings.set(['advanced', 'network_key'], key);
        return key;
    }
    generatePanID() {
        const panID = Math.floor(Math.random() * (0xFFFF - 2)) + 1;
        settings.set(['advanced', 'pan_id'], panID);
        return panID;
    }
    async getCoordinatorVersion() {
        return this.herdsman.getCoordinatorVersion();
    }
    isStopping() {
        return this.herdsman.isStopping();
    }
    async backup() {
        return this.herdsman.backup();
    }
    async getNetworkParameters() {
        return this.herdsman.getNetworkParameters();
    }
    async reset(type) {
        await this.herdsman.reset(type);
    }
    async stop() {
        logger_1.default.info('Stopping zigbee-herdsman...');
        await this.herdsman.stop();
        logger_1.default.info('Stopped zigbee-herdsman');
    }
    getPermitJoin() {
        return this.herdsman.getPermitJoin();
    }
    getPermitJoinTimeout() {
        return this.herdsman.getPermitJoinTimeout();
    }
    async permitJoin(permit, device, time = undefined) {
        if (permit) {
            logger_1.default.info(`Zigbee: allowing new devices to join${device ? ` via ${device.name}` : ''}.`);
        }
        else {
            logger_1.default.info('Zigbee: disabling joining new devices.');
        }
        if (device && permit) {
            await this.herdsman.permitJoin(permit, device.zh, time);
        }
        else {
            await this.herdsman.permitJoin(permit, undefined, time);
        }
    }
    resolveDevice(ieeeAddr) {
        if (!this.deviceLookup[ieeeAddr]) {
            const device = this.herdsman.getDeviceByIeeeAddr(ieeeAddr);
            device && (this.deviceLookup[ieeeAddr] = new device_1.default(device));
        }
        const device = this.deviceLookup[ieeeAddr];
        if (device && !device.zh.isDeleted) {
            device.ensureInSettings();
            return device;
        }
    }
    resolveGroup(groupID) {
        const group = this.herdsman.getGroupByID(Number(groupID));
        if (group && !this.groupLookup[groupID]) {
            this.groupLookup[groupID] = new group_1.default(group, this.resolveDevice);
        }
        return this.groupLookup[groupID];
    }
    resolveEntity(key) {
        if (typeof key === 'object') {
            return this.resolveDevice(key.ieeeAddr);
        }
        else if (typeof key === 'string' && key.toLowerCase() === 'coordinator') {
            return this.resolveDevice(this.herdsman.getDevicesByType('Coordinator')[0].ieeeAddr);
        }
        else {
            const settingsDevice = settings.getDevice(key.toString());
            if (settingsDevice)
                return this.resolveDevice(settingsDevice.ID);
            const groupSettings = settings.getGroup(key);
            if (groupSettings) {
                const group = this.resolveGroup(groupSettings.ID);
                // If group does not exist, create it (since it's already in configuration.yaml)
                return group ? group : this.createGroup(groupSettings.ID);
            }
        }
    }
    firstCoordinatorEndpoint() {
        return this.herdsman.getDevicesByType('Coordinator')[0].endpoints[0];
    }
    groups() {
        return this.herdsman.getGroups().map((g) => this.resolveGroup(g.groupID));
    }
    devices(includeCoordinator = true) {
        return this.herdsman.getDevices()
            .map((d) => this.resolveDevice(d.ieeeAddr))
            .filter((d) => includeCoordinator || d.zh.type !== 'Coordinator');
    }
    async acceptJoiningDeviceHandler(ieeeAddr) {
        // If passlist is set, all devices not on passlist will be rejected to join the network
        const passlist = settings.get().passlist;
        const blocklist = settings.get().blocklist;
        if (passlist.length > 0) {
            if (passlist.includes(ieeeAddr)) {
                logger_1.default.info(`Accepting joining device which is on passlist '${ieeeAddr}'`);
                return true;
            }
            else {
                logger_1.default.info(`Rejecting joining not in passlist device '${ieeeAddr}'`);
                return false;
            }
        }
        else if (blocklist.length > 0) {
            if (blocklist.includes(ieeeAddr)) {
                logger_1.default.info(`Rejecting joining device which is on blocklist '${ieeeAddr}'`);
                return false;
            }
            else {
                logger_1.default.info(`Accepting joining not in blocklist device '${ieeeAddr}'`);
                return true;
            }
        }
        else {
            return true;
        }
    }
    async touchlinkFactoryResetFirst() {
        return this.herdsman.touchlinkFactoryResetFirst();
    }
    async touchlinkFactoryReset(ieeeAddr, channel) {
        return this.herdsman.touchlinkFactoryReset(ieeeAddr, channel);
    }
    async addInstallCode(installCode) {
        await this.herdsman.addInstallCode(installCode);
    }
    async touchlinkIdentify(ieeeAddr, channel) {
        await this.herdsman.touchlinkIdentify(ieeeAddr, channel);
    }
    async touchlinkScan() {
        return this.herdsman.touchlinkScan();
    }
    createGroup(ID) {
        this.herdsman.createGroup(ID);
        return this.resolveGroup(ID);
    }
    deviceByNetworkAddress(networkAddress) {
        const device = this.herdsman.getDeviceByNetworkAddress(networkAddress);
        return device && this.resolveDevice(device.ieeeAddr);
    }
    groupByID(ID) {
        return this.resolveGroup(ID);
    }
}
exports.default = Zigbee;
__decorate([
    bind_decorator_1.default
], Zigbee.prototype, "resolveDevice", null);
__decorate([
    bind_decorator_1.default
], Zigbee.prototype, "acceptJoiningDeviceHandler", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiemlnYmVlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vbGliL3ppZ2JlZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEscURBQTJDO0FBQzNDLDJEQUFtQztBQUNuQywwREFBNEM7QUFDNUMsdURBQStCO0FBQy9CLHlEQUFpQztBQUNqQyw0RUFBa0Q7QUFDbEQsa0hBQThEO0FBQzlELDREQUFvQztBQUNwQywwREFBa0M7QUFFbEMsb0VBQWtDO0FBRWxDLE1BQXFCLE1BQU07SUFNdkIsWUFBWSxRQUFrQjtRQUh0QixnQkFBVyxHQUF5QixFQUFFLENBQUM7UUFDdkMsaUJBQVksR0FBMEIsRUFBRSxDQUFDO1FBRzdDLElBQUksQ0FBQyxRQUFRLEdBQUcsUUFBUSxDQUFDO0lBQzdCLENBQUM7SUFFRCxLQUFLLENBQUMsS0FBSztRQUNQLE1BQU0sWUFBWSxHQUFHLE1BQU0sZUFBSyxDQUFDLG9CQUFvQixDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFDekUsZ0JBQU0sQ0FBQyxJQUFJLENBQUMsNkJBQTZCLFlBQVksQ0FBQyxPQUFPLEdBQUcsQ0FBQyxDQUFDO1FBQ2xFLE1BQU0sZ0JBQWdCLEdBQUc7WUFDckIsT0FBTyxFQUFFO2dCQUNMLEtBQUssRUFBRSxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLE1BQU0sS0FBSyxVQUFVLENBQUMsQ0FBQztvQkFDbEQsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLE1BQWdCO2dCQUNuRSxhQUFhLEVBQUUsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxVQUFVO2dCQUNqRCxXQUFXLEVBQUUsQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQztnQkFDOUMsVUFBVSxFQUFFLFFBQVEsQ0FBQyxH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