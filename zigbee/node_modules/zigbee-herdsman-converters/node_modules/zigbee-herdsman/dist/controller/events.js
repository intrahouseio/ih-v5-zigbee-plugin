"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandsLookup = exports.Events = void 0;
var Events;
(function (Events) {
    Events["message"] = "message";
    Events["adapterDisconnected"] = "adapterDisconnected";
    Events["deviceJoined"] = "deviceJoined";
    Events["deviceInterview"] = "deviceInterview";
    Events["deviceAnnounce"] = "deviceAnnounce";
    Events["deviceNetworkAddressChanged"] = "deviceNetworkAddressChanged";
    Events["deviceLeave"] = "deviceLeave";
    Events["permitJoinChanged"] = "permitJoinChanged";
    Events["lastSeenChanged"] = "lastSeenChanged";
})(Events || (Events = {}));
exports.Events = Events;
const CommandsLookup = {
    'notification': 'commandNotification',
    'commisioningNotification': 'commandCommisioningNotification',
    'on': 'commandOn',
    'offWithEffect': 'commandOffWithEffect',
    'step': 'commandStep',
    'stop': 'commandStop',
    'hueNotification': 'commandHueNotification',
    'off': 'commandOff',
    'stepColorTemp': 'commandStepColorTemp',
    'stepHue': 'commandStepHue',
    'stepSaturation': 'commandStepSaturation',
    'moveWithOnOff': 'commandMoveWithOnOff',
    'move': 'commandMove',
    'moveColorTemp': 'commandMoveColorTemp',
    'moveHue': 'commandMoveHue',
    'moveToSaturation': 'commandMoveToSaturation',
    'stopWithOnOff': 'commandStopWithOnOff',
    'moveToLevel': 'commandMoveToLevel',
    'moveToLevelWithOnOff': 'commandMoveToLevelWithOnOff',
    'toggle': 'commandToggle',
    'tradfriArrowSingle': 'commandTradfriArrowSingle',
    'tradfriArrowHold': 'commandTradfriArrowHold',
    'tradfriArrowRelease': 'commandTradfriArrowRelease',
    'stepWithOnOff': 'commandStepWithOnOff',
    'moveToColorTemp': 'commandMoveToColorTemp',
    'moveToColor': 'commandMoveToColor',
    'onWithTimedOff': 'commandOnWithTimedOff',
    'recall': 'commandRecall',
    'arm': 'commandArm',
    'panic': 'commandPanic',
    'emergency': 'commandEmergency',
    'operationEventNotification': 'commandOperationEventNotification',
    'statusChangeNotification': 'commandStatusChangeNotification',
    'colorLoopSet': 'commandColorLoopSet',
    'enhancedMoveToHueAndSaturation': 'commandEnhancedMoveToHueAndSaturation',
    'downClose': 'commandDownClose',
    'upOpen': 'commandUpOpen',
    'dataResponse': 'commandDataResponse',
    'dataReport': 'commandDataReport',
    'getWeeklyScheduleRsp': 'commandGetWeeklyScheduleRsp',
    'queryNextImageRequest': 'commandQueryNextImageRequest',
    'alertsNotification': 'commandAlertsNotification',
    'programmingEventNotification': 'commandProgrammingEventNotification',
    'getPinCodeRsp': 'commandGetPinCodeRsp',
    'getUserStatusRsp': 'commandGetUserStatusRsp',
    'arrivalSensorNotify': 'commandArrivalSensorNotify',
    'getPanelStatus': 'commandGetPanelStatus',
    'checkin': 'commandCheckIn',
    'moveToHue': 'commandMoveToHue',
    'store': 'commandStore',
    // HEIMAN scenes cluster
    'atHome': 'commandAtHome',
    'goOut': 'commandGoOut',
    'cinema': 'commandCinema',
    'repast': 'commandRepast',
    'sleep': 'commandSleep',
    // HEIMAN IR remote cluster
    'studyKeyRsp': 'commandStudyKeyRsp',
    'createIdRsp': 'commandCreateIdRsp',
    'getIdAndKeyCodeListRsp': 'commandGetIdAndKeyCodeListRsp',
    'mcuSyncTime': 'commandMcuSyncTime',
    'activeStatusReport': 'commandActiveStatusReport',
    // Wiser Smart HVAC Commmands
    'wiserSmartSetSetpoint': 'commandWiserSmartSetSetpoint',
    'wiserSmartCalibrateValve': 'commandWiserSmartCalibrateValve',
    // Dafoss Ally/Hive TRV Commands
    'danfossSetpointCommand': 'commandDanfossSetpointCommand',
};
exports.CommandsLookup = CommandsLookup;
//# sourceMappingURL=events.js.map