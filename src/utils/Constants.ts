import Tenant from '../types/Tenant';

export default class Constants {
  public static readonly CSV_SEPARATOR = '\t'; // Cannot store regex in enum

  public static readonly DB_RECORD_COUNT_DEFAULT = 100;
  public static readonly DB_RECORD_COUNT_CEIL = 2000;
  public static readonly DB_RECORD_COUNT_NO_LIMIT = Number.MAX_SAFE_INTEGER;

  public static readonly DB_PARAMS_MAX_LIMIT = { limit: Constants.DB_RECORD_COUNT_NO_LIMIT, skip: 0 };
  public static readonly DB_PARAMS_SINGLE_RECORD = { limit: 1, skip: 0 };
  public static readonly DB_PARAMS_COUNT_ONLY = { limit: Constants.DB_RECORD_COUNT_NO_LIMIT, skip: 0, onlyRecordCount: true };

  public static readonly DEFAULT_TENANT = 'default';
  public static readonly DEFAULT_TENANT_OBJECT= {
    id: Constants.DEFAULT_TENANT,
    name: Constants.DEFAULT_TENANT
  } as Tenant;

  public static readonly UNKNOWN_OBJECT_ID: string = '000000000000000000000000';
  public static readonly UNKNOWN_STRING_ID: string = '000000000000000000000000';
  public static readonly UNKNOWN_NUMBER_ID: number = -1;

  public static readonly REST_RESPONSE_SUCCESS = { status: 'Success' };

  public static readonly DELAY_SMART_CHARGING_EXECUTION_MILLIS = 3000;
  public static readonly DELAY_REQUEST_CONFIGURATION_EXECUTION_MILLIS = 3000;

  public static readonly CHARGING_STATION_CONFIGURATION = 'Configuration';

  public static readonly CENTRAL_SERVER = 'Central Server';
  public static readonly OCPI_SERVER = 'OCPI Server';

  public static readonly WITH_CHARGING_STATIONS = true; // Not used
  public static readonly WITHOUT_CHARGING_STATIONS = false; // Not used
  public static readonly WITH_SITE = true; // Not used
  public static readonly WITHOUT_SITE = false; // Not used

  // Password constants
  public static readonly PWD_MIN_LENGTH = 15;
  public static readonly PWD_MAX_LENGTH = 20;
  public static readonly PWD_UPPERCASE_MIN_COUNT = 1;
  public static readonly PWD_LOWERCASE_MIN_COUNT = 1;
  public static readonly PWD_NUMBER_MIN_COUNT = 1;
  public static readonly PWD_SPECIAL_MIN_COUNT = 1;

  public static readonly PWD_UPPERCASE_RE = /([A-Z])/g; // Cannot store regex in enum
  public static readonly PWD_LOWERCASE_RE = /([a-z])/g; // Cannot store regex in enum
  public static readonly PWD_NUMBER_RE = /([\d])/g; // Cannot store regex in enum
  public static readonly PWD_SPECIAL_CHAR_RE = /([!#$%^&*.?-])/g; // Cannot store regex in enum

  public static readonly SUPPORTED_LOCALES = ['en_US', 'fr_FR'];
  public static readonly SUPPORTED_LANGUAGES = ['en', 'fr'];
  public static readonly DEFAULT_LOCALE = 'en_US';
  public static readonly DEFAULT_LANGUAGE = 'en';

  public static readonly ANONYMIZED_VALUE = '####';

  public static readonly WS_DEFAULT_KEEPALIVE = 30; // Seconds
  public static readonly WS_RECONNECT_DISABLED = 0;
  public static readonly WS_RECONNECT_UNLIMITED = -1;
  public static readonly WS_DEFAULT_RECONNECT_MAX_RETRIES = -1;
  public static readonly WS_DEFAULT_RECONNECT_TIMEOUT = 30; // Seconds
  public static readonly WS_UNSUPPORTED_DATA = 1007;

  public static readonly OCPP_SOCKET_TIMEOUT = 30000; // 30 sec
  public static readonly OCPP_RESPONSE_ACCEPTED = 'Accepted';

  public static readonly MAX_DATE = new Date('9999-12-31Z23:59:59:999');
  public static readonly MIN_DATE = new Date('1970-01-01Z00:00:00:000');

  public static readonly MONGO_USER_MASK = {
    '_id': 0,
    '__v': 0,
    'email': 0,
    'phone': 0,
    'mobile': 0,
    'notificationsActive': 0,
    'notifications': 0,
    'iNumber': 0,
    'costCenter': 0,
    'status': 0,
    'createdBy': 0,
    'createdOn': 0,
    'lastChangedBy': 0,
    'lastChangedOn': 0,
    'role': 0,
    'password': 0,
    'locale': 0,
    'deleted': 0,
    'passwordWrongNbrTrials': 0,
    'passwordBlockedUntil': 0,
    'passwordResetHash': 0,
    'eulaAcceptedOn': 0,
    'eulaAcceptedVersion': 0,
    'eulaAcceptedHash': 0,
    'image': 0,
    'address': 0,
    'plateID': 0,
    'verificationToken': 0
  };
}
