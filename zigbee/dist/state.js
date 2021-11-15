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
const logger_1 = __importDefault(require("./util/logger"));
const data_1 = __importDefault(require("./util/data"));
const settings = __importStar(require("./util/settings"));
const fs_1 = __importDefault(require("fs"));
const object_assign_deep_1 = __importDefault(require("object-assign-deep"));
const saveInterval = 1000 * 60 * 5; // 5 minutes
const dontCacheProperties = [
    '^action$', '^action_.*$', '^button$', '^button_left$', '^button_right$', '^click$', '^forgotten$', '^keyerror$',
    '^step_size$', '^transition_time$', '^group_list$', '^group_capacity$', '^no_occupancy_since$',
    '^step_mode$', '^transition_time$', '^duration$', '^elapsed$', '^from_side$', '^to_side$',
];
class State {
    constructor(eventBus) {
        this.state = {};
        this.file = data_1.default.joinPath('state.json');
        this.timer = null;
        this.eventBus = eventBus;
    }
    start() {
        this.load();
        // Save the state on every interval
        this.timer = setInterval(() => this.save(), saveInterval);
        this.eventBus.onDeviceLeave(this, (data) => delete this.state[data.ieeeAddr]);
    }
    stop() {
        this.eventBus.removeListeners(this);
        clearTimeout(this.timer);
        this.save();
    }
    load() {
        if (fs_1.default.existsSync(this.file)) {
            try {
                this.state = JSON.parse(fs_1.default.readFileSync(this.file, 'utf8'));
                logger_1.default.debug(`Loaded state from file ${this.file}`);
            }
            catch (e) {
                logger_1.default.debug(`Failed to load state from file ${this.file} (corrupt file?)`);
            }
        }
        else {
            logger_1.default.debug(`Can't load state from file ${this.file} (doesn't exist)`);
        }
    }
    save() {
        if (settings.get().advanced.cache_state_persistent) {
            logger_1.default.debug(`Saving state to file ${this.file}`);
            const json = JSON.stringify(this.state, null, 4);
            try {
                fs_1.default.writeFileSync(this.file, json, 'utf8');
            }
            catch (e) {
                logger_1.default.error(`Failed to write state to '${this.file}' (${e.message})`);
            }
        }
        else {
            logger_1.default.debug(`Not saving state`);
        }
    }
    exists(entity) {
        return this.state.hasOwnProperty(entity.ID);
    }
    get(entity) {
        return this.state[entity.ID];
    }
    set(entity, update, reason = null) {
        const fromState = this.state[entity.ID] || {};
        const toState = (0, object_assign_deep_1.default)({}, fromState, update);
        const result = { ...toState };
        for (const property of Object.keys(toState)) {
            if (dontCacheProperties.find((p) => property.match(p))) {
                delete toState[property];
            }
        }
        this.state[entity.ID] = toState;
        this.eventBus.emitStateChange({ entity, from: fromState, to: toState, reason, update });
        return result;
    }
    remove(ID) {
        delete this.state[ID];
    }
}
exports.default = State;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhdGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9saWIvc3RhdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsMkRBQW1DO0FBQ25DLHVEQUErQjtBQUMvQiwwREFBNEM7QUFDNUMsNENBQW9CO0FBQ3BCLDRFQUFrRDtBQUVsRCxNQUFNLFlBQVksR0FBRyxJQUFJLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLFlBQVk7QUFFaEQsTUFBTSxtQkFBbUIsR0FBRztJQUN4QixVQUFVLEVBQUUsYUFBYSxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsZ0JBQWdCLEVBQUUsU0FBUyxFQUFFLGFBQWEsRUFBRSxZQUFZO0lBQ2hILGFBQWEsRUFBRSxtQkFBbUIsRUFBRSxjQUFjLEVBQUUsa0JBQWtCLEVBQUUsc0JBQXNCO0lBQzlGLGFBQWEsRUFBRSxtQkFBbUIsRUFBRSxZQUFZLEVBQUUsV0FBVyxFQUFFLGFBQWEsRUFBRSxXQUFXO0NBQzVGLENBQUM7QUFFRixNQUFNLEtBQUs7SUFNUCxZQUFZLFFBQWtCO1FBTHRCLFVBQUssR0FBcUMsRUFBRSxDQUFDO1FBQzdDLFNBQUksR0FBRyxjQUFJLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQ25DLFVBQUssR0FBaUIsSUFBSSxDQUFDO1FBSS9CLElBQUksQ0FBQyxRQUFRLEdBQUcsUUFBUSxDQUFDO0lBQzdCLENBQUM7SUFFRCxLQUFLO1FBQ0QsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1FBRVosbUNBQW1DO1FBQ25DLElBQUksQ0FBQyxLQUFLLEdBQUcsV0FBVyxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsRUFBRSxZQUFZLENBQUMsQ0FBQztRQUMxRCxJQUFJLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztJQUNsRixDQUFDO0lBRUQsSUFBSTtRQUNBLElBQUksQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3BDLFlBQVksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDekIsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO0lBQ2hCLENBQUM7SUFFTyxJQUFJO1FBQ1IsSUFBSSxZQUFFLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRTtZQUMxQixJQUFJO2dCQUNBLElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxZQUFFLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQztnQkFDNUQsZ0JBQU0sQ0FBQyxLQUFLLENBQUMsMEJBQTBCLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO2FBQ3ZEO1lBQUMsT0FBTyxDQUFDLEVBQUU7Z0JBQ1IsZ0JBQU0sQ0FBQyxLQUFLLENBQUMsa0NBQWtDLElBQUksQ0FBQyxJQUFJLGtCQUFrQixDQUFDLENBQUM7YUFDL0U7U0FDSjthQUFNO1lBQ0gsZ0JBQU0sQ0FBQyxLQUFLLENBQUMsOEJBQThCLElBQUksQ0FBQyxJQUFJLGtCQUFrQixDQUFDLENBQUM7U0FDM0U7SUFDTCxDQUFDO0lBRU8sSUFBSTtRQUNSLElBQUksUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRTtZQUNoRCxnQkFBTSxDQUFDLEtBQUssQ0FBQyx3QkFBd0IsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7WUFDbEQsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNqRCxJQUFJO2dCQUNBLFlBQUUsQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsTUFBTSxDQUFDLENBQUM7YUFDN0M7WUFBQyxPQUFPLENBQUMsRUFBRTtnQkFDUixnQkFBTSxDQUFDLEtBQUssQ0FBQyw2QkFBNkIsSUFBSSxDQUFDLElBQUksTUFBTSxDQUFDLENBQUMsT0FBTyxHQUFHLENBQUMsQ0FBQzthQUMxRTtTQUNKO2FBQU07WUFDSCxnQkFBTSxDQUFDLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1NBQ3BDO0lBQ0wsQ0FBQztJQUVELE1BQU0sQ0FBQyxNQUFzQjtRQUN6QixPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUNoRCxDQUFDO0lBRUQsR0FBRyxDQUFDLE1BQXNCO1FBQ3RCLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDakMsQ0FBQztJQUVELEdBQUcsQ0FBQyxNQUFzQixFQUFFLE1BQWdCLEVBQUUsU0FBZSxJQUFJO1FBQzdELE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUM5QyxNQUFNLE9BQU8sR0FBRyxJQUFBLDRCQUFnQixFQUFDLEVBQUUsRUFBRSxTQUFTLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDeEQsTUFBTSxNQUFNLEdBQUcsRUFBQyxHQUFHLE9BQU8sRUFBQyxDQUFDO1FBRTVCLEtBQUssTUFBTSxRQUFRLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRTtZQUN6QyxJQUFJLG1CQUFtQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFO2dCQUNwRCxPQUFPLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQzthQUM1QjtTQUNKO1FBRUQsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLEdBQUcsT0FBTyxDQUFDO1FBQ2hDLElBQUksQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLEVBQUMsTUFBTSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsRUFBRSxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFDLENBQUMsQ0FBQztRQUN0RixPQUFPLE1BQU0sQ0FBQztJQUNsQixDQUFDO0lBRUQsTUFBTSxDQUFDLEVBQW1CO1FBQ3RCLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUMxQixDQUFDO0NBQ0o7QUFFRCxrQkFBZSxLQUFLLENBQUMifQ==