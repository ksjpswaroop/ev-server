import { Action, Entity } from '../../types/Authorization';
import express, { NextFunction, Request, Response } from 'express';

import CentralRestServerAuthentication from './CentralRestServerAuthentication';
import CentralRestServerService from './CentralRestServerService';
import CentralSystemRestServiceConfiguration from '../../types/configuration/CentralSystemRestServiceConfiguration';
import ChangeNotification from '../../types/ChangeNotification';
import ChargingStationConfiguration from '../../types/configuration/ChargingStationConfiguration';
import Configuration from '../../utils/Configuration';
import Constants from '../../utils/Constants';
import HttpStatusCodes from 'http-status-codes';
import Logging from '../../utils/Logging';
import { ServerAction } from '../../types/Server';
import SessionHashService from './service/SessionHashService';
import SingleChangeNotification from '../../types/SingleChangeNotification';
import UserToken from '../../types/UserToken';
import cluster from 'cluster';
import expressTools from '../ExpressTools';
import http from 'http';
import morgan from 'morgan';
import sanitize from 'express-sanitizer';
import socketio from 'socket.io';
import socketioJwt from 'socketio-jwt';
import util from 'util';

const MODULE_NAME = 'CentralRestServer';

interface SocketIOJwt extends socketio.Socket {
  decoded_token: UserToken;
}

export default class CentralRestServer {
  private static centralSystemRestConfig;
  private static restHttpServer: http.Server;
  private static socketIOServer: socketio.Server;
  private static changeNotifications: ChangeNotification[] = [];
  private static singleChangeNotifications: SingleChangeNotification[] = [];
  private chargingStationConfig: ChargingStationConfiguration;
  private expressApplication: express.Application;

  // Create the rest server
  constructor(centralSystemRestConfig: CentralSystemRestServiceConfiguration, chargingStationConfig: ChargingStationConfiguration) {
    // Keep params
    CentralRestServer.centralSystemRestConfig = centralSystemRestConfig;
    this.chargingStationConfig = chargingStationConfig;

    // Initialize express app
    this.expressApplication = expressTools.initApplication('2mb');

    // Mount express-sanitizer middleware
    this.expressApplication.use(sanitize());

    // Log to console
    if (CentralRestServer.centralSystemRestConfig.debug) {
      // Log
      this.expressApplication.use(
        morgan('combined', {
          'stream': {
            write: (message) => {
              // Log
              Logging.logDebug({
                tenantID: Constants.DEFAULT_TENANT,
                module: MODULE_NAME, method: 'constructor',
                action: ServerAction.EXPRESS_SERVER,
                message: message
              });
            }
          }
        })
      );
    }

    // Authentication
    this.expressApplication.use(CentralRestServerAuthentication.initialize());

    // Auth services
    this.expressApplication.all('/client/auth/:action', CentralRestServerAuthentication.authService.bind(this));

    // Secured API
    this.expressApplication.all('/client/api/:action', CentralRestServerAuthentication.authenticate(), CentralRestServerService.restServiceSecured.bind(this));

    // Util API
    this.expressApplication.all('/client/util/:action', CentralRestServerService.restServiceUtil.bind(this));
    // Workaround URL encoding issue
    this.expressApplication.all('/client%2Futil%2FFirmwareDownload%3FFileName%3Dr7_update_3.3.0.10_d4.epk', async (req: Request, res: Response, next: NextFunction) => {
      req.url = decodeURIComponent(req.originalUrl);
      req.params.action = 'FirmwareDownload';
      req.query.FileName = 'r7_update_3.3.0.10_d4.epk';
      await CentralRestServerService.restServiceUtil(req, res, next);
    });

    // Catchall for util with logging
    this.expressApplication.all(['/client/util/*', '/client%2Futil%2F*'], (req: Request, res: Response) => {
      Logging.logDebug({
        tenantID: Constants.DEFAULT_TENANT,
        module: MODULE_NAME, method: 'constructor',
        action: ServerAction.EXPRESS_SERVER,
        message: `Unhandled URL ${req.method} request (original URL ${req.originalUrl})`,
        detailedMessages: 'Request: ' + util.inspect(req)
      });
      res.sendStatus(HttpStatusCodes.NOT_FOUND);
    });

    // Create HTTP server to serve the express app
    CentralRestServer.restHttpServer = expressTools.createHttpServer(CentralRestServer.centralSystemRestConfig, this.expressApplication);
  }

  startSocketIO() {
    // Log
    const logMsg = 'Starting REST SocketIO Server...';
    Logging.logInfo({
      tenantID: Constants.DEFAULT_TENANT,
      module: MODULE_NAME, method: 'startSocketIO',
      action: ServerAction.STARTUP,
      message: logMsg
    });
    // eslint-disable-next-line no-console
    console.log(logMsg.replace('...', '') + ` ${cluster.isWorker ? 'in worker ' + cluster.worker.id : 'in master'}...`);
    // Init Socket IO
    CentralRestServer.socketIOServer = socketio(CentralRestServer.restHttpServer, { pingTimeout: 15000, pingInterval: 30000 });
    CentralRestServer.socketIOServer.use((socket: socketio.Socket, next) => {
      Logging.logDebug({
        tenantID: Constants.DEFAULT_TENANT,
        module: MODULE_NAME, method: 'startSocketIO',
        action: ServerAction.SOCKET_IO,
        message: 'SocketIO client is trying to connect from ' + socket.handshake.headers.origin,
        detailedMessages: { socketIOid: socket.id, socketIOHandshake: socket.handshake }
      });
      next();
    });
    CentralRestServer.socketIOServer.use(socketioJwt.authorize({
      secret: Configuration.getCentralSystemRestServiceConfig().userTokenKey,
      handshake: true,
      decodedPropertyName: 'decoded_token',
    }));
    // Handle Socket IO connection
    CentralRestServer.socketIOServer.on('connect', (socket: SocketIOJwt) => {
      const userToken: UserToken = socket.decoded_token;
      if (!userToken || !userToken.tenantID) {
        Logging.logWarning({
          tenantID: Constants.DEFAULT_TENANT,
          module: MODULE_NAME, method: 'startSocketIO',
          action: ServerAction.SOCKET_IO,
          message: 'SocketIO client is trying to connect without token',
          detailedMessages: { socketIOid: socket.id, socketIOHandshake: socket.handshake }
        });
        socket.disconnect(true);
      } else {
        Logging.logDebug({
          tenantID: userToken.tenantID,
          module: MODULE_NAME, method: 'startSocketIO',
          action: ServerAction.SOCKET_IO,
          message: 'SocketIO client is connected',
          detailedMessages: { socketIOid: socket.id, socketIOHandshake: socket.handshake }
        });
        socket.join(userToken.tenantID);
        // Handle Socket IO disconnection
        socket.on('disconnect', (reason) => {
          Logging.logDebug({
            tenantID: userToken.tenantID,
            module: MODULE_NAME, method: 'startSocketIO',
            action: ServerAction.SOCKET_IO,
            message: `SocketIO client is disconnected: ${reason}`,
            detailedMessages: { socketIOid: socket.id, socketIOHandshake: socket.handshake }
          });
        });
      }
    });

    // Check and send notification change for single record
    setInterval(() => {
      // Send
      while (CentralRestServer.singleChangeNotifications.length > 0) {
        const notification = CentralRestServer.singleChangeNotifications.shift();
        CentralRestServer.socketIOServer.to(notification.tenantID).emit(notification.entity, notification);
      }
    }, CentralRestServer.centralSystemRestConfig.socketIOSingleNotificationIntervalSecs * 1000);

    // Check and send notification change for list
    setInterval(() => {
      // Send
      while (CentralRestServer.changeNotifications.length > 0) {
        const notification = CentralRestServer.changeNotifications.shift();
        CentralRestServer.socketIOServer.to(notification.tenantID).emit(notification.entity, notification);
      }
    }, CentralRestServer.centralSystemRestConfig.socketIOListNotificationIntervalSecs * 1000);
  }

  // Start the server
  start() {
    expressTools.startServer(CentralRestServer.centralSystemRestConfig, CentralRestServer.restHttpServer, 'REST', MODULE_NAME);
  }

  public notifyUser(tenantID: string, action: Action, data) {
    // On User change rebuild userHashID
    if (data && data.id) {
      SessionHashService.rebuildUserHashID(tenantID, data.id).catch(() => {});
    }
    // Add in buffer
    this.addSingleChangeNotificationInBuffer({
      'tenantID': tenantID,
      'entity': Entity.USER,
      'action': action,
      'data': data
    });
    // Add in buffer
    this.addChangeNotificationInBuffer({
      'tenantID': tenantID,
      'entity': Entity.USERS,
      'action': action
    });
  }

  public notifyTenant(tenantID: string, action: Action, data) {
    // On Tenant change rebuild tenantHashID
    if (data && data.id) {
      SessionHashService.rebuildTenantHashID(data.id).catch(() => {});
    }
    // Add in buffer
    this.addSingleChangeNotificationInBuffer({
      'tenantID': tenantID,
      'entity': Entity.TENANT,
      'action': action,
      'data': data
    });
    // Add in buffer
    this.addChangeNotificationInBuffer({
      'tenantID': tenantID,
      'entity': Entity.TENANTS,
      'action': action
    });
  }

  public notifySite(tenantID: string, action: Action, data) {
    // Add in buffer
    this.addSingleChangeNotificationInBuffer({
      'tenantID': tenantID,
      'entity': Entity.SITE,
      'action': action,
      'data': data
    });
    // Add in buffer
    this.addChangeNotificationInBuffer({
      'tenantID': tenantID,
      'entity': Entity.SITES,
      'action': action
    });
  }

  public notifySiteArea(tenantID: string, action: Action, data) {
    // Add in buffer
    this.addSingleChangeNotificationInBuffer({
      'tenantID': tenantID,
      'entity': Entity.SITE_AREA,
      'action': action,
      'data': data
    });
    // Add in buffer
    this.addChangeNotificationInBuffer({
      'tenantID': tenantID,
      'entity': Entity.SITE_AREAS,
      'action': action
    });
  }

  public notifyCompany(tenantID: string, action: Action, data) {
    // Add in buffer
    this.addSingleChangeNotificationInBuffer({
      'tenantID': tenantID,
      'entity': Entity.COMPANY,
      'action': action,
      'data': data
    });
    // Add in buffer
    this.addChangeNotificationInBuffer({
      'tenantID': tenantID,
      'entity': Entity.COMPANIES,
      'action': action
    });
  }

  public notifyAsset(tenantID: string, action: Action, data) {
    // Add in buffer
    this.addSingleChangeNotificationInBuffer({
      'tenantID': tenantID,
      'entity': Entity.ASSET,
      'action': action,
      'data': data
    });
    // Add in buffer
    this.addChangeNotificationInBuffer({
      'tenantID': tenantID,
      'entity': Entity.ASSETS,
      'action': action
    });
  }

  public notifyTransaction(tenantID: string, action: Action, data) {
    // Add in buffer
    this.addSingleChangeNotificationInBuffer({
      'tenantID': tenantID,
      'entity': Entity.TRANSACTION,
      'action': action,
      'data': data
    });
    // Add in buffer
    this.addChangeNotificationInBuffer({
      'tenantID': tenantID,
      'entity': Entity.TRANSACTIONS,
      'action': action
    });
  }

  public notifyChargingStation(tenantID: string, action: Action, data) {
    // Add in buffer
    this.addSingleChangeNotificationInBuffer({
      'tenantID': tenantID,
      'entity': Entity.CHARGING_STATION,
      'action': action,
      'data': data
    });
    // Add in buffer
    this.addChangeNotificationInBuffer({
      'tenantID': tenantID,
      'entity': Entity.CHARGING_STATIONS,
      'action': action
    });
  }

  public notifyLogging(tenantID: string, action: Action) {
    // Add in buffer
    this.addChangeNotificationInBuffer({
      'tenantID': tenantID,
      'entity': Entity.LOGGINGS,
      'action': action
    });
  }

  public notifyRegistrationToken(tenantID: string, action: Action, data) {
    // Add in buffer
    this.addSingleChangeNotificationInBuffer({
      'tenantID': tenantID,
      'entity': Entity.REGISTRATION_TOKEN,
      'action': action,
      'data': data
    });
    // Add in buffer
    this.addChangeNotificationInBuffer({
      'tenantID': tenantID,
      'entity': Entity.REGISTRATION_TOKENS,
      'action': action
    });
  }

  public notifyInvoice(tenantID: string, action: Action, data) {
    // Add in buffer
    this.addSingleChangeNotificationInBuffer({
      'tenantID': tenantID,
      'entity': Entity.INVOICE,
      'action': action,
      'data': data
    });
    // Add in buffer
    this.addChangeNotificationInBuffer({
      'tenantID': tenantID,
      'entity': Entity.INVOICES,
      'action': action
    });
  }

  public notifyCar(tenantID: string, action: Action, data) {
    // Add in buffer
    this.addSingleChangeNotificationInBuffer({
      'tenantID': tenantID,
      'entity': Entity.CAR,
      'action': action,
      'data': data
    });
    // Add in buffer
    this.addChangeNotificationInBuffer({
      'tenantID': tenantID,
      'entity': Entity.CARS,
      'action': action
    });
  }

  public notifyCarCatalog(tenantID: string, action: Action, data) {
    // Add in buffer
    this.addSingleChangeNotificationInBuffer({
      'tenantID': tenantID,
      'entity': Entity.CAR_CATALOG,
      'action': action,
      'data': data
    });
    // Add in buffer
    this.addChangeNotificationInBuffer({
      'tenantID': tenantID,
      'entity': Entity.CAR_CATALOGS,
      'action': action
    });
  }

  public notifyChargingProfile(tenantID: string, action: Action, data) {
    // Add in buffer
    this.addSingleChangeNotificationInBuffer({
      'tenantID': tenantID,
      'entity': Entity.CHARGING_PROFILE,
      'action': action,
      'data': data
    });
    // Add in buffer
    this.addChangeNotificationInBuffer({
      'tenantID': tenantID,
      'entity': Entity.CHARGING_PROFILES,
      'action': action
    });
  }

  public notifyOcpiEndpoint(tenantID: string, action: Action, data) {
    // Add in buffer
    this.addSingleChangeNotificationInBuffer({
      'tenantID': tenantID,
      'entity': Entity.OCPI_ENDPOINT,
      'action': action,
      'data': data
    });
    // Add in buffer
    this.addChangeNotificationInBuffer({
      'tenantID': tenantID,
      'entity': Entity.OCPI_ENDPOINTS,
      'action': action
    });
  }

  private addChangeNotificationInBuffer(notification: ChangeNotification) {
    let dups = false;
    // Add in buffer
    for (const currentNotification of CentralRestServer.changeNotifications) {
      // Same Entity and Action?
      if (currentNotification.tenantID === notification.tenantID &&
        currentNotification.entity === notification.entity &&
        currentNotification.action === notification.action) {
        // Yes
        dups = true;
        break;
      }
    }
    // Found dups?
    if (!dups) {
      // No: Add it
      CentralRestServer.changeNotifications.push(notification);
    }
  }

  private addSingleChangeNotificationInBuffer(notification: SingleChangeNotification) {
    let dups = false;
    // Add in buffer
    for (const currentNotification of CentralRestServer.singleChangeNotifications) {
      // Same Entity and Action?
      if (currentNotification.tenantID === notification.tenantID &&
        currentNotification.entity === notification.entity &&
        currentNotification.action === notification.action &&
        currentNotification.data.id === notification.data.id &&
        currentNotification.data.type === notification.data.type
      ) {
        // Yes
        dups = true;
        break;
      }
    }
    // Found dups?
    if (!dups) {
      // No: Add it
      CentralRestServer.singleChangeNotifications.push(notification);
    }
  }
}
