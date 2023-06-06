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
const utils_1 = __importDefault(require("../util/utils"));
const logger_1 = __importDefault(require("../util/logger"));
const json_stable_stringify_without_jsonify_1 = __importDefault(require("json-stable-stringify-without-jsonify"));
const extension_1 = __importDefault(require("./extension"));
const bind_decorator_1 = __importDefault(require("bind-decorator"));
/**
 * This extension creates a network map
 */
class NetworkMap extends extension_1.default {
    constructor() {
        super(...arguments);
        this.legacyApi = settings.get().advanced.legacy_api;
        this.legacyTopic = `${settings.get().mqtt.base_topic}/bridge/networkmap`;
        this.legacyTopicRoutes = `${settings.get().mqtt.base_topic}/bridge/networkmap/routes`;
        this.topic = `${settings.get().mqtt.base_topic}/bridge/request/networkmap`;
    }
    async start() {
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
        this.supportedFormats = {
            'raw': this.raw,
            'graphviz': this.graphviz,
            'plantuml': this.plantuml,
        };
    }
    async onMQTTMessage(data) {
        /* istanbul ignore else */
        if (this.legacyApi) {
            if ((data.topic === this.legacyTopic || data.topic === this.legacyTopicRoutes) &&
                this.supportedFormats.hasOwnProperty(data.message)) {
                const includeRoutes = data.topic === this.legacyTopicRoutes;
                const topology = await this.networkScan(includeRoutes);
                let converted = this.supportedFormats[data.message](topology);
                converted = data.message === 'raw' ? (0, json_stable_stringify_without_jsonify_1.default)(converted) : converted;
                this.mqtt.publish(`bridge/networkmap/${data.message}`, converted, {});
            }
        }
        if (data.topic === this.topic) {
            const message = utils_1.default.parseJSON(data.message, data.message);
            try {
                const type = typeof message === 'object' ? message.type : message;
                if (!this.supportedFormats.hasOwnProperty(type)) {
                    throw new Error(`Type '${type}' not supported, allowed are: ${Object.keys(this.supportedFormats)}`);
                }
                const routes = typeof message === 'object' && message.routes;
                const topology = await this.networkScan(routes);
                const value = this.supportedFormats[type](topology);
                await this.mqtt.publish('bridge/response/networkmap', (0, json_stable_stringify_without_jsonify_1.default)(utils_1.default.getResponse(message, { routes, type, value }, null)));
            }
            catch (error) {
                await this.mqtt.publish('bridge/response/networkmap', (0, json_stable_stringify_without_jsonify_1.default)(utils_1.default.getResponse(message, {}, error.message)));
            }
        }
    }
    raw(topology) {
        return topology;
    }
    graphviz(topology) {
        const colors = settings.get().map_options.graphviz.colors;
        let text = 'digraph G {\nnode[shape=record];\n';
        let style = '';
        topology.nodes.forEach((node) => {
            const labels = [];
            // Add friendly name
            labels.push(`${node.friendlyName}`);
            // Add the device short network address, ieeaddr and scan note (if any)
            labels.push(`${node.ieeeAddr} (${utils_1.default.toNetworkAddressHex(node.networkAddress)})` +
                ((node.failed && node.failed.length) ? `failed: ${node.failed.join(',')}` : ''));
            // Add the device model
            if (node.type !== 'Coordinator') {
                if (node.definition) {
                    labels.push(`${node.definition.vendor} ${node.definition.description} (${node.definition.model})`);
                }
                else {
                    // This model is not supported by zigbee-herdsman-converters, add zigbee model information
                    labels.push(`${node.manufacturerName} ${node.modelID}`);
                }
            }
            // Add the device last_seen timestamp
            let lastSeen = 'unknown';
            const date = node.type === 'Coordinator' ? Date.now() : node.lastSeen;
            if (date) {
                lastSeen = utils_1.default.formatDate(date, 'relative');
            }
            labels.push(lastSeen);
            // Shape the record according to device type
            if (node.type == 'Coordinator') {
                style = `style="bold, filled", fillcolor="${colors.fill.coordinator}", ` +
                    `fontcolor="${colors.font.coordinator}"`;
            }
            else if (node.type == 'Router') {
                style = `style="rounded, filled", fillcolor="${colors.fill.router}", ` +
                    `fontcolor="${colors.font.router}"`;
            }
            else {
                style = `style="rounded, dashed, filled", fillcolor="${colors.fill.enddevice}", ` +
                    `fontcolor="${colors.font.enddevice}"`;
            }
            // Add the device with its labels to the graph as a node.
            text += `  "${node.ieeeAddr}" [` + style + `, label="{${labels.join('|')}}"];\n`;
            /**
             * Add an edge between the device and its child to the graph
             * NOTE: There are situations where a device is NOT in the topology, this can be e.g.
             * due to not responded to the lqi scan. In that case we do not add an edge for this device.
             */
            topology.links.filter((e) => (e.source.ieeeAddr === node.ieeeAddr)).forEach((e) => {
                const lineStyle = (node.type == 'EndDevice') ? 'penwidth=1, ' :
                    (!e.routes.length) ? 'penwidth=0.5, ' : 'penwidth=2, ';
                const lineWeight = (!e.routes.length) ? `weight=0, color="${colors.line.inactive}", ` :
                    `weight=1, color="${colors.line.active}", `;
                const textRoutes = e.routes.map((r) => utils_1.default.toNetworkAddressHex(r.destinationAddress));
                const lineLabels = (!e.routes.length) ? `label="${e.linkquality}"` :
                    `label="${e.linkquality} (routes: ${textRoutes.join(',')})"`;
                text += `  "${node.ieeeAddr}" -> "${e.target.ieeeAddr}"`;
                text += ` [${lineStyle}${lineWeight}${lineLabels}]\n`;
            });
        });
        text += '}';
        return text.replace(/\0/g, '');
    }
    plantuml(topology) {
        const text = [];
        text.push(`' paste into: https://www.planttext.com/`);
        text.push(``);
        text.push('@startuml');
        topology.nodes.sort((a, b) => a.friendlyName.localeCompare(b.friendlyName)).forEach((node) => {
            // Add friendly name
            text.push(`card ${node.ieeeAddr} [`);
            text.push(`${node.friendlyName}`);
            text.push(`---`);
            // Add the device short network address, ieeaddr and scan note (if any)
            text.push(`${node.ieeeAddr} (${utils_1.default.toNetworkAddressHex(node.networkAddress)})` +
                ((node.failed && node.failed.length) ? ` failed: ${node.failed.join(',')}` : ''));
            // Add the device model
            if (node.type !== 'Coordinator') {
                text.push(`---`);
                const definition = this.zigbee.resolveEntity(node.ieeeAddr).definition;
                if (definition) {
                    text.push(`${definition.vendor} ${definition.description} (${definition.model})`);
                }
                else {
                    // This model is not supported by zigbee-herdsman-converters, add zigbee model information
                    text.push(`${node.manufacturerName} ${node.modelID}`);
                }
            }
            // Add the device last_seen timestamp
            let lastSeen = 'unknown';
            const date = node.type === 'Coordinator' ? Date.now() : node.lastSeen;
            if (date) {
                lastSeen = utils_1.default.formatDate(date, 'relative');
            }
            text.push(`---`);
            text.push(lastSeen);
            text.push(`]`);
            text.push(``);
        });
        /**
         * Add edges between the devices
         * NOTE: There are situations where a device is NOT in the topology, this can be e.g.
         * due to not responded to the lqi scan. In that case we do not add an edge for this device.
         */
        topology.links.forEach((link) => {
            text.push(`${link.sourceIeeeAddr} --> ${link.targetIeeeAddr}: ${link.lqi}`);
        });
        text.push('');
        text.push(`@enduml`);
        return text.join(`\n`);
    }
    async networkScan(includeRoutes) {
        logger_1.default.info(`Starting network scan (includeRoutes '${includeRoutes}')`);
        const devices = this.zigbee.devices().filter((d) => d.zh.type !== 'GreenPower' && !d.options.disabled);
        const lqis = new Map();
        const routingTables = new Map();
        const failed = new Map();
        for (const device of devices.filter((d) => d.zh.type != 'EndDevice')) {
            failed.set(device, []);
            await utils_1.default.sleep(1); // sleep 1 second between each scan to reduce stress on network.
            const doRequest = async (request, firstAttempt = true) => {
                try {
                    return await request();
                }
                catch (error) {
                    if (!firstAttempt) {
                        throw error;
                    }
                    else {
                        // Network is possibly congested, sleep 5 seconds to let the network settle.
                        await utils_1.default.sleep(5);
                        return doRequest(request, false);
                    }
                }
            };
            try {
                const result = await doRequest(async () => device.zh.lqi());
                lqis.set(device, result);
                logger_1.default.debug(`LQI succeeded for '${device.name}'`);
            }
            catch (error) {
                failed.get(device).push('lqi');
                logger_1.default.error(`Failed to execute LQI for '${device.name}'`);
                logger_1.default.debug(error.stack);
            }
            if (includeRoutes) {
                try {
                    const result = await doRequest(async () => device.zh.routingTable());
                    routingTables.set(device, result);
                    logger_1.default.debug(`Routing table succeeded for '${device.name}'`);
                }
                catch (error) {
                    failed.get(device).push('routingTable');
                    logger_1.default.error(`Failed to execute routing table for '${device.name}'`);
                }
            }
        }
        logger_1.default.info(`Network scan finished`);
        const topology = { nodes: [], links: [] };
        // Add nodes
        for (const device of devices) {
            const definition = device.definition ? {
                model: device.definition.model,
                vendor: device.definition.vendor,
                description: device.definition.description,
                supports: Array.from(new Set((device.exposes()).map((e) => {
                    return e.hasOwnProperty('name') ? e.name :
                        `${e.type} (${e.features.map((f) => f.name).join(', ')})`;
                }))).join(', '),
            } : null;
            topology.nodes.push({
                ieeeAddr: device.ieeeAddr, friendlyName: device.name, type: device.zh.type,
                networkAddress: device.zh.networkAddress, manufacturerName: device.zh.manufacturerName,
                modelID: device.zh.modelID, failed: failed.get(device), lastSeen: device.zh.lastSeen,
                definition,
            });
        }
        // Add links
        lqis.forEach((lqi, device) => {
            for (const neighbor of lqi.neighbors) {
                if (neighbor.relationship > 3) {
                    // Relationship is not active, skip it
                    continue;
                }
                // Some Xiaomi devices return 0x00 as the neighbor ieeeAddr (obviously not correct).
                // Determine the correct ieeeAddr based on the networkAddress.
                const neighborDevice = this.zigbee.deviceByNetworkAddress(neighbor.networkAddress);
                if (neighbor.ieeeAddr === '0x0000000000000000' && neighborDevice) {
                    neighbor.ieeeAddr = neighborDevice.ieeeAddr;
                }
                const link = {
                    source: { ieeeAddr: neighbor.ieeeAddr, networkAddress: neighbor.networkAddress },
                    target: { ieeeAddr: device.ieeeAddr, networkAddress: device.zh.networkAddress },
                    linkquality: neighbor.linkquality, depth: neighbor.depth, routes: [],
                    // DEPRECATED:
                    sourceIeeeAddr: neighbor.ieeeAddr, targetIeeeAddr: device.ieeeAddr,
                    sourceNwkAddr: neighbor.networkAddress, lqi: neighbor.linkquality,
                    relationship: neighbor.relationship,
                };
                const routingTable = routingTables.get(device);
                if (routingTable) {
                    link.routes = routingTable.table
                        .filter((t) => t.status === 'ACTIVE' && t.nextHop === neighbor.networkAddress);
                }
                topology.links.push(link);
            }
        });
        return topology;
    }
}
exports.default = NetworkMap;
__decorate([
    bind_decorator_1.default
], NetworkMap.prototype, "onMQTTMessage", null);
__decorate([
    bind_decorator_1.default
], NetworkMap.prototype, "raw", null);
__decorate([
    bind_decorator_1.default
], NetworkMap.prototype, "graphviz", null);
__decorate([
    bind_decorator_1.default
], NetworkMap.prototype, "plantuml", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmV0d29ya01hcC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2xpYi9leHRlbnNpb24vbmV0d29ya01hcC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsMkRBQTZDO0FBQzdDLDBEQUFrQztBQUNsQyw0REFBb0M7QUFDcEMsa0hBQThEO0FBQzlELDREQUFvQztBQUNwQyxvRUFBa0M7QUFnQmxDOztHQUVHO0FBQ0gsTUFBcUIsVUFBVyxTQUFRLG1CQUFTO0lBQWpEOztRQUNZLGNBQVMsR0FBRyxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQztRQUMvQyxnQkFBVyxHQUFHLEdBQUcsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLG9CQUFvQixDQUFDO1FBQ3BFLHNCQUFpQixHQUFHLEdBQUcsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLDJCQUEyQixDQUFDO1FBQ2pGLFVBQUssR0FBRyxHQUFHLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsVUFBVSw0QkFBNEIsQ0FBQztJQXFTbEYsQ0FBQztJQWxTWSxLQUFLLENBQUMsS0FBSztRQUNoQixJQUFJLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQ3RELElBQUksQ0FBQyxnQkFBZ0IsR0FBRztZQUNwQixLQUFLLEVBQUUsSUFBSSxDQUFDLEdBQUc7WUFDZixVQUFVLEVBQUUsSUFBSSxDQUFDLFFBQVE7WUFDekIsVUFBVSxFQUFFLElBQUksQ0FBQyxRQUFRO1NBQzVCLENBQUM7SUFDTixDQUFDO0lBRVcsQUFBTixLQUFLLENBQUMsYUFBYSxDQUFDLElBQTJCO1FBQ2pELDBCQUEwQjtRQUMxQixJQUFJLElBQUksQ0FBQyxTQUFTLEVBQUU7WUFDaEIsSUFBSSxD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