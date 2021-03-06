import { OCPPAuthorizeRequestExtended, OCPPBootNotificationRequestExtended, OCPPDataTransferRequestExtended, OCPPDiagnosticsStatusNotificationRequestExtended, OCPPFirmwareStatusNotificationRequestExtended, OCPPHeartbeatRequestExtended, OCPPNormalizedMeterValues, OCPPStatusNotificationRequestExtended } from '../../types/ocpp/OCPPServer';

import Constants from '../../utils/Constants';
import Cypher from '../../utils/Cypher';
import { DataResult } from '../../types/DataResult';
import DatabaseUtils from './DatabaseUtils';
import DbParams from '../../types/database/DbParams';
import Logging from '../../utils/Logging';
import { ServerAction } from '../../types/Server';
import Utils from '../../utils/Utils';
import global from '../../types/GlobalType';

const MODULE_NAME = 'OCPPStorage';

export default class OCPPStorage {
  static async saveAuthorize(tenantID: string, authorize: OCPPAuthorizeRequestExtended) {
    // Debug
    const uniqueTimerID = Logging.traceStart(MODULE_NAME, 'saveAuthorize');
    // Check Tenant
    await Utils.checkTenant(tenantID);
    const timestamp = Utils.convertToDate(authorize.timestamp);
    // Insert
    await global.database.getCollection<any>(tenantID, 'authorizes')
      .insertOne({
        _id: Cypher.hash(`${authorize.chargeBoxID}~${timestamp.toISOString()}`),
        tagID: authorize.idTag,
        authorizationId: authorize.authorizationId,
        chargeBoxID: authorize.chargeBoxID,
        userID: authorize.user ? Utils.convertToObjectID(authorize.user.id) : null,
        timestamp: timestamp,
        timezone: authorize.timezone
      });
    // Debug
    Logging.traceEnd(MODULE_NAME, 'saveAuthorize', uniqueTimerID);
  }

  static async getAuthorizes(tenantID: string, params: {dateFrom?: Date; chargeBoxID?: string; tagID?: string}, dbParams: DbParams): Promise<DataResult<OCPPAuthorizeRequestExtended>> {
    // Debug
    const uniqueTimerID = Logging.traceStart(MODULE_NAME, 'getAuthorizes');
    // Check Tenant
    await Utils.checkTenant(tenantID);
    // Check Limit
    dbParams.limit = Utils.checkRecordLimit(dbParams.limit);
    // Check Skip
    dbParams.skip = Utils.checkRecordSkip(dbParams.skip);
    // Set the filters
    const filters: any = {};
    // Date from provided?
    if (params.dateFrom) {
      filters.timestamp = {};
      filters.timestamp.$gte = new Date(params.dateFrom);
    }
    // Charging Station
    if (params.chargeBoxID) {
      filters.chargeBoxID = params.chargeBoxID;
    }
    // Tag ID
    if (params.tagID) {
      filters.tagID = params.tagID;
    }
    // Create Aggregation
    const aggregation = [];
    // Filters
    if (filters) {
      aggregation.push({
        $match: filters
      });
    }
    // Count Records
    const authorizesCountMDB = await global.database.getCollection<any>(tenantID, 'authorizes')
      .aggregate([...aggregation, { $count: 'count' }], { allowDiskUse: true })
      .toArray();
    // Sort
    if (dbParams.sort) {
      // Sort
      aggregation.push({
        $sort: dbParams.sort
      });
    } else {
      // Default
      aggregation.push({
        $sort: {
          timestamp: -1
        }
      });
    }
    // Skip
    aggregation.push({
      $skip: dbParams.skip
    });
    // Limit
    aggregation.push({
      $limit: dbParams.limit
    });
    // Read DB
    const authorizesMDB = await global.database.getCollection<any>(tenantID, 'authorizes')
      .aggregate(aggregation, { collation: { locale: Constants.DEFAULT_LOCALE, strength: 2 }, allowDiskUse: true })
      .toArray();
    // Debug
    Logging.traceEnd(MODULE_NAME, 'getAuthorizes', uniqueTimerID);
    // Ok
    return {
      count: (authorizesCountMDB.length > 0 ? authorizesCountMDB[0].count : 0),
      result: authorizesMDB
    };
  }

  static async saveHeartbeat(tenantID: string, heartbeat: OCPPHeartbeatRequestExtended) {
    // Debug
    const uniqueTimerID = Logging.traceStart(MODULE_NAME, 'saveHeartbeat');
    // Check Tenant
    await Utils.checkTenant(tenantID);
    const timestamp = Utils.convertToDate(heartbeat.timestamp);
    // Insert
    await global.database.getCollection<any>(tenantID, 'heartbeats')
      .insertOne({
        _id: Cypher.hash(`${heartbeat.chargeBoxID}~${timestamp.toISOString()}`),
        chargeBoxID: heartbeat.chargeBoxID,
        timestamp: timestamp,
        timezone: heartbeat.timezone
      });
    // Debug
    Logging.traceEnd(MODULE_NAME, 'saveHeartbeat', uniqueTimerID);
  }

  static async getStatusNotifications(tenantID: string, params: {dateFrom?: Date; chargeBoxID?: string; connectorId?: number; status?: string}, dbParams: DbParams) {
    // Debug
    const uniqueTimerID = Logging.traceStart(MODULE_NAME, 'getStatusNotifications');
    // Check Tenant
    await Utils.checkTenant(tenantID);
    // Check Limit
    dbParams.limit = Utils.checkRecordLimit(dbParams.limit);
    // Check Skip
    dbParams.skip = Utils.checkRecordSkip(dbParams.skip);
    // Set the filters
    const filters: any = {};
    // Date from provided?
    if (params.dateFrom) {
      filters.timestamp = {};
      filters.timestamp.$gte = new Date(params.dateFrom);
    }
    // Charging Station
    if (params.chargeBoxID) {
      filters.chargeBoxID = params.chargeBoxID;
    }
    // Connector ID
    if (params.connectorId) {
      filters.connectorId = params.connectorId;
    }
    // Status
    if (params.status) {
      filters.status = params.status;
    }
    // Create Aggregation
    const aggregation = [];
    // Filters
    if (filters) {
      aggregation.push({
        $match: filters
      });
    }
    // Count Records
    const statusNotificationsCountMDB = await global.database.getCollection<any>(tenantID, 'statusnotifications')
      .aggregate([...aggregation, { $count: 'count' }], { allowDiskUse: true })
      .toArray();
    // Sort
    if (dbParams.sort) {
      // Sort
      aggregation.push({
        $sort: dbParams.sort
      });
    } else {
      // Default
      aggregation.push({
        $sort: {
          _id: 1
        }
      });
    }
    // Skip
    aggregation.push({
      $skip: dbParams.skip
    });
    // Limit
    aggregation.push({
      $limit: dbParams.limit
    });
    // Read DB
    const statusNotificationsMDB = await global.database.getCollection<any>(tenantID, 'statusnotifications')
      .aggregate(aggregation, { collation: { locale: Constants.DEFAULT_LOCALE, strength: 2 }, allowDiskUse: true })
      .toArray();
    const statusNotifications = [];
    // Create
    for (const statusNotificationMDB of statusNotificationsMDB) {
      // Create status notification
      const statusNotification = statusNotificationMDB;
      // Add
      statusNotifications.push(statusNotification);
    }
    // Debug
    Logging.traceEnd(MODULE_NAME, 'getStatusNotifications', uniqueTimerID);
    // Ok
    return {
      count: (statusNotificationsCountMDB.length > 0 ? statusNotificationsCountMDB[0].count : 0),
      result: statusNotifications
    };
  }

  static async getLastStatusNotifications(tenantID: string, params: {dateBefore?: string; chargeBoxID?: string; connectorId?: number; status?: string}) {
    // Debug
    const uniqueTimerID = Logging.traceStart(MODULE_NAME, 'getLastStatusNotifications');
    // Check Tenant
    await Utils.checkTenant(tenantID);
    // Set the filters
    const filters: any = {};
    // Date before provided?
    if (params.dateBefore) {
      filters.timestamp = {};
      filters.timestamp.$lte = new Date(params.dateBefore);
    }
    // Charging Station
    if (params.chargeBoxID) {
      filters.chargeBoxID = params.chargeBoxID;
    }
    // Connector ID
    if (params.connectorId) {
      filters.connectorId = params.connectorId;
    }
    // Status
    if (params.status) {
      filters.status = params.status;
    }
    // Create Aggregation
    const aggregation = [];
    // Filters
    if (filters) {
      aggregation.push({
        $match: filters
      });
    }
    // Sort
    aggregation.push({ $sort: { 'timestamp': -1 } });
    // Skip
    aggregation.push({ $skip: 0 });
    // Limit
    aggregation.push({ $limit: 1 });
    // Read DB
    const statusNotificationsMDB = await global.database.getCollection<any>(tenantID, 'statusnotifications')
      .aggregate(aggregation, { collation: { locale: Constants.DEFAULT_LOCALE, strength: 2 }, allowDiskUse: true })
      .toArray();
    const statusNotifications = [];
    // Create
    for (const statusNotificationMDB of statusNotificationsMDB) {
      // Create status notification
      const statusNotification = statusNotificationMDB;
      // Add
      statusNotifications.push(statusNotification);
    }
    // Debug
    Logging.traceEnd(MODULE_NAME, 'getLastStatusNotifications', uniqueTimerID);
    // Ok
    return statusNotifications;
  }

  static async saveStatusNotification(tenantID: string, statusNotificationToSave: OCPPStatusNotificationRequestExtended) {
    // Debug
    const uniqueTimerID = Logging.traceStart(MODULE_NAME, 'saveStatusNotification');
    // Set
    const timestamp = Utils.convertToDate(statusNotificationToSave.timestamp);
    // Check Tenant
    await Utils.checkTenant(tenantID);
    const statusNotificationMDB: any = {
      _id: Cypher.hash(`${statusNotificationToSave.chargeBoxID}~${statusNotificationToSave.connectorId}~${statusNotificationToSave.status}~${timestamp.toISOString()}`),
      timestamp,
      chargeBoxID: statusNotificationToSave.chargeBoxID,
      connectorId: Utils.convertToInt(statusNotificationToSave.connectorId),
      timezone: statusNotificationToSave.timezone,
      status: statusNotificationToSave.status,
      errorCode: statusNotificationToSave.errorCode,
      info: statusNotificationToSave.info,
      vendorId: statusNotificationToSave.vendorId,
      vendorErrorCode: statusNotificationToSave.vendorErrorCode
    };
    // Insert
    await global.database.getCollection<any>(tenantID, 'statusnotifications')
      .insertOne(statusNotificationMDB);
    // Debug
    Logging.traceEnd(MODULE_NAME, 'saveStatusNotification', uniqueTimerID);
  }

  static async saveDataTransfer(tenantID: string, dataTransfer: OCPPDataTransferRequestExtended) {
    // Debug
    const uniqueTimerID = Logging.traceStart(MODULE_NAME, 'saveDataTransfer');
    // Check Tenant
    await Utils.checkTenant(tenantID);
    // Set the ID
    const timestamp = Utils.convertToDate(dataTransfer.timestamp);
    // Insert
    await global.database.getCollection<any>(tenantID, 'datatransfers')
      .insertOne({
        _id: Cypher.hash(`${dataTransfer.chargeBoxID}~${dataTransfer.data}~${timestamp.toISOString()}`),
        vendorId: dataTransfer.vendorId,
        messageId: dataTransfer.messageId,
        data: dataTransfer.data,
        chargeBoxID: dataTransfer.chargeBoxID,
        timestamp: timestamp,
        timezone: dataTransfer.timezone
      });
    // Debug
    Logging.traceEnd(MODULE_NAME, 'saveDataTransfer', uniqueTimerID);
  }

  static async saveBootNotification(tenantID: string, bootNotification: OCPPBootNotificationRequestExtended) {
    // Debug
    const uniqueTimerID = Logging.traceStart(MODULE_NAME, 'saveBootNotification');
    // Check Tenant
    await Utils.checkTenant(tenantID);
    // Insert
    const timestamp = Utils.convertToDate(bootNotification.timestamp);
    await global.database.getCollection<any>(tenantID, 'bootnotifications')
      .insertOne({
        _id: Cypher.hash(`${bootNotification.chargeBoxID}~${timestamp.toISOString()}`),
        chargeBoxID: bootNotification.chargeBoxID,
        chargePointVendor: bootNotification.chargePointVendor,
        chargePointModel: bootNotification.chargePointModel,
        chargePointSerialNumber: bootNotification.chargePointSerialNumber,
        chargeBoxSerialNumber: bootNotification.chargeBoxSerialNumber,
        firmwareVersion: bootNotification.firmwareVersion,
        ocppVersion: bootNotification.ocppVersion,
        ocppProtocol: bootNotification.ocppProtocol,
        endpoint: bootNotification.endpoint,
        timestamp: timestamp
      });
    // Debug
    Logging.traceEnd(MODULE_NAME, 'saveBootNotification', uniqueTimerID);
  }

  public static async getBootNotifications(tenantID: string, params: {chargeBoxID?: string}, { limit, skip, sort }: DbParams) {
    // Debug
    const uniqueTimerID = Logging.traceStart(MODULE_NAME, 'getBootNotifications');
    // Check Tenant
    await Utils.checkTenant(tenantID);
    // Check Limit
    limit = Utils.checkRecordLimit(limit);
    // Check Skip
    skip = Utils.checkRecordSkip(skip);
    // Create Aggregation
    const aggregation = [];
    // Set the filters
    const filters: any = {
      '$or': DatabaseUtils.getNotDeletedFilter()
    };

    // Charging Station ID
    if (params.chargeBoxID) {
      filters._id = params.chargeBoxID;
    }
    // Filters
    aggregation.push({
      $match: filters
    });
    // Count Records
    const bootNotificationsCountMDB = await global.database.getCollection<any>(tenantID, 'bootnotifications')
      .aggregate([...aggregation, { $count: 'count' }], { allowDiskUse: true })
      .toArray();
    // Add Created By / Last Changed By
    DatabaseUtils.pushCreatedLastChangedInAggregation(tenantID, aggregation);
    // Sort
    if (sort) {
      // Sort
      aggregation.push({
        $sort: sort
      });
    } else {
      // Default
      aggregation.push({
        $sort: { _id: 1 }
      });
    }
    // Skip
    aggregation.push({
      $skip: skip
    });
    // Limit
    aggregation.push({
      $limit: limit
    });
    // Read DB
    const bootNotificationsMDB = await global.database.getCollection<any>(tenantID, 'bootnotifications')
      .aggregate(aggregation, { collation: { locale: Constants.DEFAULT_LOCALE, strength: 2 }, allowDiskUse: true })
      .toArray();
    const bootNotifications = [];
    // Create
    for (const bootNotificationMDB of bootNotificationsMDB) {
      // Add
      bootNotifications.push(bootNotificationMDB);
    }
    // Debug
    Logging.traceEnd(MODULE_NAME, 'getBootNotifications', uniqueTimerID);
    // Ok
    return {
      count: (bootNotificationsCountMDB.length > 0 ? bootNotificationsCountMDB[0].count : 0),
      result: bootNotifications
    };
  }

  static async saveDiagnosticsStatusNotification(tenantID: string, diagnosticsStatusNotification: OCPPDiagnosticsStatusNotificationRequestExtended) {
    // Debug
    const uniqueTimerID = Logging.traceStart(MODULE_NAME, 'saveDiagnosticsStatusNotification');
    // Check Tenant
    await Utils.checkTenant(tenantID);
    const timestamp = Utils.convertToDate(diagnosticsStatusNotification.timestamp);
    // Insert
    await global.database.getCollection<any>(tenantID, 'diagnosticsstatusnotifications')
      .insertOne({
        _id: Cypher.hash(`${diagnosticsStatusNotification.chargeBoxID}~${timestamp.toISOString()}`),
        chargeBoxID: diagnosticsStatusNotification.chargeBoxID,
        status: diagnosticsStatusNotification.status,
        timestamp: timestamp,
        timezone: diagnosticsStatusNotification.timezone
      });
    // Debug
    Logging.traceEnd(MODULE_NAME, 'saveDiagnosticsStatusNotification', uniqueTimerID);
  }

  static async saveFirmwareStatusNotification(tenantID: string, firmwareStatusNotification: OCPPFirmwareStatusNotificationRequestExtended) {
    // Debug
    const uniqueTimerID = Logging.traceStart(MODULE_NAME, 'saveFirmwareStatusNotification');
    // Check Tenant
    await Utils.checkTenant(tenantID);
    // Set the ID
    const timestamp = Utils.convertToDate(firmwareStatusNotification.timestamp);
    // Insert
    await global.database.getCollection<any>(tenantID, 'firmwarestatusnotifications')
      .insertOne({
        _id: Cypher.hash(`${firmwareStatusNotification.chargeBoxID}~${timestamp.toISOString()}`),
        chargeBoxID: firmwareStatusNotification.chargeBoxID,
        status: firmwareStatusNotification.status,
        timestamp: timestamp,
        timezone: firmwareStatusNotification.timezone
      });
    // Debug
    Logging.traceEnd(MODULE_NAME, 'saveFirmwareStatusNotification', uniqueTimerID);
  }

  static async saveMeterValues(tenantID: string, meterValuesToSave: OCPPNormalizedMeterValues) {
    // Debug
    const uniqueTimerID = Logging.traceStart(MODULE_NAME, 'saveMeterValues');
    // Check
    await Utils.checkTenant(tenantID);
    // Save all
    for (const meterValueToSave of meterValuesToSave.values) {
      try {
        const timestamp = Utils.convertToDate(meterValueToSave.timestamp);
        const meterValueMDB = {
          _id: Cypher.hash(`${meterValueToSave.chargeBoxID}~${meterValueToSave.connectorId}~${timestamp.toISOString()}~${meterValueToSave.value}~${JSON.stringify(meterValueToSave.attribute)}`),
          chargeBoxID: meterValueToSave.chargeBoxID,
          connectorId: Utils.convertToInt(meterValueToSave.connectorId),
          transactionId: Utils.convertToInt(meterValueToSave.transactionId),
          timestamp,
          value: meterValueToSave.attribute.format === 'SignedData' ? meterValueToSave.value : Utils.convertToInt(meterValueToSave.value),
          attribute: meterValueToSave.attribute,
        };
        // Execute
        await global.database.getCollection<any>(tenantID, 'metervalues').insertOne(meterValueMDB);
      } catch (error) {
        Logging.logError({
          tenantID,
          source: meterValueToSave.chargeBoxID,
          module: MODULE_NAME, method: 'saveMeterValues',
          action: ServerAction.METER_VALUES,
          message: 'An error occurred while trying to save the meter value',
          detailedMessages: { error: error.message, stack: error.stack, meterValue: meterValueToSave }
        });
      }
    }
    // Debug
    Logging.traceEnd(MODULE_NAME, 'saveMeterValues', uniqueTimerID, { meterValuesToSave });
  }
}
