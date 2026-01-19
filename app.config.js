import 'dotenv/config';

export default ({ config }) => {
  const IS_DEV = process.env.APP_VARIANT === 'development';
  const IS_PREVIEW = process.env.APP_VARIANT === 'preview';

  const getAppName = () => {
    if (IS_DEV) return "Mariner's AI (Dev)";
    if (IS_PREVIEW) return "Mariner's AI (Preview)";
    return "Mariner's AI Grid";
  };

  const getBundleId = () => {
    if (IS_DEV) return "com.thescottybe.marinersaigrid.dev";
    if (IS_PREVIEW) return "com.thescottybe.marinersaigrid.preview";
    return "com.thescottybe.marinersaigrid";
  };

  return {
    ...config,
    name: getAppName(),
    slug: "mariners-ai-grid",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/app-icon.png",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: getBundleId(),
      icon: "./assets/app-icon.png",
      infoPlist: {
        NSLocalNetworkUsageDescription: "Required to connect to your boat's Signal K server.",
        NSLocationWhenInUseUsageDescription: "Required to show your current position on the weather grid.",
        NSLocationAlwaysAndWhenInUseUsageDescription: "Required for background weather alerts and route optimization."
      },
      privacyManifests: {
        NSPrivacyAccessedAPITypes: [
          {
            NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryDiskSpace",
            NSPrivacyAccessedAPITypeReasons: ["E174.1"] // Required for caching weather seeds and offline vector DB
          },
          {
            NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryFileTimestamp",
            NSPrivacyAccessedAPITypeReasons: ["DDA9.1"] // Required to check weather seed freshness
          },
          {
            NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults",
            NSPrivacyAccessedAPITypeReasons: ["CA92.1"] // Used by expo-secure-store for Shadow Auth
          }
        ],
        NSPrivacyCollectedDataTypes: [
          {
            NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypeDeviceID",
            NSPrivacyCollectedDataTypeLinked: true,
            NSPrivacyCollectedDataTypeTracking: false,
            NSPrivacyCollectedDataTypePurposes: ["NSPrivacyCollectedDataTypePurposeAppFunctionality"]
          },
          {
            NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypeCoarseLocation",
            NSPrivacyCollectedDataTypeLinked: false,
            NSPrivacyCollectedDataTypeTracking: false,
            NSPrivacyCollectedDataTypePurposes: ["NSPrivacyCollectedDataTypePurposeAppFunctionality"]
          }
        ],
        NSPrivacyTracking: false,
        NSPrivacyTrackingDomains: []
      }
    },
    android: {
      package: getBundleId(),
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff"
      },
      permissions: [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "INTERNET",
        "ACCESS_NETWORK_STATE",
        "BODY_SENSORS"
      ],
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false
    },
    web: {
      favicon: "./assets/favicon.png"
    },
    plugins: [
      "expo-dev-client",
      "expo-location",
      "expo-sqlite",
      [
        "expo-build-properties",
        {
          ios: {
            deploymentTarget: "16.0"
          },
          android: {
            compileSdkVersion: 36,
            extraMavenRepos: [],
            enableShrinkResources: false
          }
        }
      ],
      [
        "@rnmapbox/maps",
        {
          RNMapboxMapsVersion: "11.16.2"
        }
      ],
      [
        "./plugins/with-sqlite-vec/withSqliteVec.js",
        {
          version: "0.1.6",
          debug: IS_DEV
        }
      ]
    ],
    extra: {
      eas: {
        projectId: "dd3b8b54-8d49-43b1-bea7-669fd80e10c9"
      },
      signalKUrl: process.env.EXPO_PUBLIC_SIGNALK_URL || (IS_DEV ? "ws://localhost:3000/signalk/v1/stream" : "ws://signalk.local:3000/signalk/v1/stream"),
      gridApiUrl: process.env.EXPO_PUBLIC_GRID_API_URL || (IS_DEV ? "http://localhost:3001" : "https://api.marinersai.grid"),
    }
  };
};
