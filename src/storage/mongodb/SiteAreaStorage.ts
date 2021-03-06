import global, { Image } from '../../types/GlobalType';

import Constants from '../../utils/Constants';
import { DataResult } from '../../types/DataResult';
import DatabaseUtils from './DatabaseUtils';
import DbParams from '../../types/database/DbParams';
import Logging from '../../utils/Logging';
import { ObjectID } from 'mongodb';
import SiteArea from '../../types/SiteArea';
import Utils from '../../utils/Utils';

const MODULE_NAME = 'SiteAreaStorage';

export default class SiteAreaStorage {
  public static async getSiteAreaImage(tenantID: string, id: string): Promise<Image> {
    // Debug
    const uniqueTimerID = Logging.traceStart(MODULE_NAME, 'getSiteAreaImage');
    // Check Tenant
    await Utils.checkTenant(tenantID);
    // Read DB
    const siteAreaImageMDB = await global.database.getCollection<{ _id: ObjectID; image: string }>(tenantID, 'siteareaimages')
      .findOne({ _id: Utils.convertToObjectID(id) });
    // Debug
    Logging.traceEnd(MODULE_NAME, 'getSiteAreaImage', uniqueTimerID, { id });
    return {
      id: id, image: siteAreaImageMDB ? siteAreaImageMDB.image : null
    };
  }

  public static async getSiteArea(tenantID: string, id: string = Constants.UNKNOWN_OBJECT_ID,
    params: { withSite?: boolean; withChargingStations?: boolean } = {}): Promise<SiteArea> {
    // Debug
    const uniqueTimerID = Logging.traceStart(MODULE_NAME, 'getSiteArea');
    // Check Tenant
    await Utils.checkTenant(tenantID);
    // Exec
    const siteAreaResult = await SiteAreaStorage.getSiteAreas(
      tenantID,
      {
        siteAreaID: id,
        withSite: params.withSite,
        withChargingStations: params.withChargingStations,
        withAvailableChargers: true
      },
      Constants.DB_PARAMS_SINGLE_RECORD
    );
    // Debug
    Logging.traceEnd(MODULE_NAME, 'getSiteArea', uniqueTimerID, {
      id,
      withChargingStations: params.withChargingStations,
      withSite: params.withSite
    });
    return siteAreaResult.result[0];
  }

  public static async saveSiteArea(tenantID: string, siteAreaToSave: SiteArea, saveImage = false): Promise<string> {
    // Debug
    const uniqueTimerID = Logging.traceStart(MODULE_NAME, 'saveSiteArea');
    // Check Tenant
    await Utils.checkTenant(tenantID);
    // Set
    const siteAreaMDB: any = {
      _id: !siteAreaToSave.id ? new ObjectID() : Utils.convertToObjectID(siteAreaToSave.id),
      name: siteAreaToSave.name,
      issuer: siteAreaToSave.issuer,
      accessControl: Utils.convertToBoolean(siteAreaToSave.accessControl),
      smartCharging: Utils.convertToBoolean(siteAreaToSave.smartCharging),
      siteID: Utils.convertToObjectID(siteAreaToSave.siteID),
      maximumPower: Utils.convertToFloat(siteAreaToSave.maximumPower),
      voltage: Utils.convertToInt(siteAreaToSave.voltage),
      numberOfPhases: Utils.convertToInt(siteAreaToSave.numberOfPhases),
    };
    if (siteAreaToSave.address) {
      siteAreaMDB.address = siteAreaToSave.address;
    }
    // Add Last Changed/Created props
    DatabaseUtils.addLastChangedCreatedProps(siteAreaMDB, siteAreaToSave);
    // Modify
    await global.database.getCollection<SiteArea>(tenantID, 'siteareas').findOneAndUpdate(
      { _id: siteAreaMDB._id },
      { $set: siteAreaMDB },
      { upsert: true, returnOriginal: false }
    );
    if (saveImage) {
      await SiteAreaStorage.saveSiteAreaImage(tenantID, siteAreaMDB._id.toHexString(), siteAreaToSave.image);
    }
    // Debug
    Logging.traceEnd(MODULE_NAME, 'saveSiteArea', uniqueTimerID, { siteAreaToSave });
    return siteAreaMDB._id.toHexString();
  }

  public static async getSiteAreas(tenantID: string,
    params: {
      siteAreaID?: string; search?: string; siteIDs?: string[]; withSite?: boolean; issuer?: boolean;
      withChargingStations?: boolean; smartCharging?: boolean; withAvailableChargers?: boolean;
    } = {},
    dbParams: DbParams, projectFields?: string[]): Promise<DataResult<SiteArea>> {
    // Debug
    const uniqueTimerID = Logging.traceStart(MODULE_NAME, 'getSiteAreas');
    // Check Tenant
    await Utils.checkTenant(tenantID);
    // Check Limit
    const limit = Utils.checkRecordLimit(dbParams.limit);
    // Check Skip
    const skip = Utils.checkRecordSkip(dbParams.skip);
    // Set the filters
    const filters: any = {};
    // Query by Site Area ID if available
    if (params.siteAreaID) {
      filters._id = Utils.convertToObjectID(params.siteAreaID);
      // Otherwise check if search is present
    } else if (params.search) {
      filters.$or = [
        { 'name': { $regex: Utils.escapeSpecialCharsInRegex(params.search), $options: 'i' } }
      ];
    }
    // Set Site thru a filter in the dashboard
    if (params.siteIDs && Array.isArray(params.siteIDs)) {
      filters.siteID = {
        $in: params.siteIDs.map((site) => Utils.convertToObjectID(site))
      };
    }
    if (params.issuer === true || params.issuer === false) {
      filters.issuer = params.issuer;
    }
    if (params.smartCharging === true || params.smartCharging === false) {
      filters.smartCharging = params.smartCharging;
    }
    // Create Aggregation
    const aggregation = [];
    // Filters
    if (filters) {
      aggregation.push({
        $match: filters
      });
    }
    // Sites
    if (params.withSite) {
      DatabaseUtils.pushSiteLookupInAggregation({
        tenantID, aggregation, localField: 'siteID', foreignField: '_id',
        asField: 'site', oneToOneCardinality: true
      });
    }
    // Limit records?
    if (!dbParams.onlyRecordCount) {
      // Always limit the nbr of record to avoid perfs issues
      aggregation.push({ $limit: Constants.DB_RECORD_COUNT_CEIL });
    }
    // Count Records
    const siteAreasCountMDB = await global.database.getCollection<DataResult<SiteArea>>(tenantID, 'siteareas')
      .aggregate([...aggregation, { $count: 'count' }], { allowDiskUse: true })
      .toArray();
    // Check if only the total count is requested
    if (dbParams.onlyRecordCount) {
      // Return only the count
      return {
        count: (siteAreasCountMDB.length > 0 ? siteAreasCountMDB[0].count : 0),
        result: []
      };
    }
    // Remove the limit
    aggregation.pop();
    // Charging Stations
    if (params.withChargingStations || params.withAvailableChargers) {
      DatabaseUtils.pushChargingStationLookupInAggregation({
        tenantID, aggregation, localField: '_id', foreignField: 'siteAreaID',
        asField: 'chargingStations'
      });
    }
    // Convert Object ID to string
    DatabaseUtils.pushConvertObjectIDToString(aggregation, 'siteID');
    // Add Last Changed / Created
    DatabaseUtils.pushCreatedLastChangedInAggregation(tenantID, aggregation);
    // Handle the ID
    DatabaseUtils.pushRenameDatabaseID(aggregation);
    // Sort
    if (dbParams.sort) {
      // Sort
      aggregation.push({
        $sort: dbParams.sort
      });
    } else {
      // Default
      aggregation.push({
        $sort: { name: 1 }
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
    // Project
    if (projectFields) {
      DatabaseUtils.projectFields(aggregation,
        [...projectFields, 'chargingStations.id', 'chargingStations.connectors', 'chargingStations.lastHeartBeat',
          'chargingStations.deleted', 'chargingStations.cannotChargeInParallel', 'chargingStations.private', 'chargingStations.inactive']);
    }
    // Read DB
    const siteAreasMDB = await global.database.getCollection<any>(tenantID, 'siteareas')
      .aggregate(aggregation, {
        collation: { locale: Constants.DEFAULT_LOCALE, strength: 2 },
        allowDiskUse: true
      })
      .toArray();
    const siteAreas: SiteArea[] = [];
    // TODO: Handle this coding into the MongoDB request
    if (siteAreasMDB && siteAreasMDB.length > 0) {
      // Create
      for (const siteAreaMDB of siteAreasMDB) {
        // Count Available/Occupied Chargers/Connectors
        if (params.withAvailableChargers) {
          // Set the Charging Stations' Connector statuses
          siteAreaMDB.connectorStats = Utils.getConnectorStatusesFromChargingStations(siteAreaMDB.chargingStations);
        }
        // Chargers
        if (!params.withChargingStations && siteAreaMDB.chargingStations) {
          delete siteAreaMDB.chargingStations;
        }
        // Add
        siteAreas.push(siteAreaMDB);
      }
    }
    // Debug
    Logging.traceEnd(MODULE_NAME, 'getSiteAreas', uniqueTimerID,
      { params, limit: dbParams.limit, skip: dbParams.skip, sort: dbParams.sort });
    // Ok
    return {
      count: (siteAreasCountMDB.length > 0 ?
        (siteAreasCountMDB[0].count === Constants.DB_RECORD_COUNT_CEIL ? -1 : siteAreasCountMDB[0].count) : 0),
      result: siteAreas
    };
  }

  public static async deleteSiteArea(tenantID: string, id: string): Promise<void> {
    // Debug
    const uniqueTimerID = Logging.traceStart(MODULE_NAME, 'deleteSiteArea');
    // Delete singular site area
    await SiteAreaStorage.deleteSiteAreas(tenantID, [id]);
    // Debug
    Logging.traceEnd(MODULE_NAME, 'deleteSiteArea', uniqueTimerID, { id });
  }

  public static async deleteSiteAreas(tenantID: string, siteAreaIDs: string[]) {
    // Debug
    const uniqueTimerID = Logging.traceStart(MODULE_NAME, 'deleteSiteAreas');
    // Check Tenant
    await Utils.checkTenant(tenantID);
    // Remove Charging Station's Site Area
    await global.database.getCollection<any>(tenantID, 'chargingstations').updateMany(
      { siteAreaID: { $in: siteAreaIDs.map((ID) => Utils.convertToObjectID(ID)) } },
      { $set: { siteAreaID: null } },
      { upsert: false }
    );
    // Remove Asset's Site Area
    await global.database.getCollection<any>(tenantID, 'assets').updateMany(
      { siteAreaID: { $in: siteAreaIDs.map((ID) => Utils.convertToObjectID(ID)) } },
      { $set: { siteAreaID: null } },
      { upsert: false }
    );
    // Delete SiteArea
    await global.database.getCollection<any>(tenantID, 'siteareas').deleteMany(
      { '_id': { $in: siteAreaIDs.map((ID) => Utils.convertToObjectID(ID)) } }
    );
    // Delete Image
    await global.database.getCollection<any>(tenantID, 'sitesareaimages').deleteMany(
      { '_id': { $in: siteAreaIDs.map((ID) => Utils.convertToObjectID(ID)) } }
    );
    // Debug
    Logging.traceEnd(MODULE_NAME, 'deleteSiteAreas', uniqueTimerID, { siteAreaIDs });
  }

  public static async deleteSiteAreasFromSites(tenantID: string, siteIDs: string[]) {
    // Debug
    const uniqueTimerID = Logging.traceStart(MODULE_NAME, 'deleteSiteAreasFromSites');
    // Check Tenant
    await Utils.checkTenant(tenantID);
    // Find site areas to delete
    const siteareas: string[] = (await global.database.getCollection<any>(tenantID, 'siteareas')
      .find({ siteID: { $in: siteIDs.map((id) => Utils.convertToObjectID(id)) } })
      .project({ _id: 1 }).toArray()).map((idWrapper): string => idWrapper._id.toHexString());
    // Delete site areas
    await SiteAreaStorage.deleteSiteAreas(tenantID, siteareas);
    // Debug
    Logging.traceEnd(MODULE_NAME, 'deleteSiteAreasFromSites', uniqueTimerID, { siteIDs });
  }

  private static async saveSiteAreaImage(tenantID: string, siteAreaID: string, siteAreaImageToSave: string): Promise<void> {
    // Debug
    const uniqueTimerID = Logging.traceStart(MODULE_NAME, 'saveSiteAreaImage');
    // Check Tenant
    await Utils.checkTenant(tenantID);
    // Modify
    await global.database.getCollection<any>(tenantID, 'siteareaimages').findOneAndUpdate(
      { '_id': Utils.convertToObjectID(siteAreaID) },
      { $set: { image: siteAreaImageToSave } },
      { upsert: true, returnOriginal: false }
    );
    // Debug
    Logging.traceEnd(MODULE_NAME, 'saveSiteAreaImage', uniqueTimerID);
  }
}
