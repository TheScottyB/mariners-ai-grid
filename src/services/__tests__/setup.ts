
import { vi } from 'vitest';

// 1. Define global constants
(global as any).__DEV__ = true;
process.env.EXPO_OS = 'ios';

// 2. Mock react-native
vi.mock('react-native', () => {
  const EventEmitter = class {
    addListener = vi.fn(() => ({ remove: vi.fn() }));
    removeListeners = vi.fn();
    removeAllListeners = vi.fn();
    emit = vi.fn();
  };

  return {
    Platform: {
      OS: 'ios',
      select: vi.fn(objs => objs.ios || objs.default),
      Version: 1,
    },
    NativeModules: {
      ExpoFileSystem: mockFileSystem,
      FileSystem: mockFileSystem,
    },
    TurboModuleRegistry: {
      get: vi.fn((name) => {
        if (name === 'ExpoFileSystem' || name === 'FileSystem') {
          return mockFileSystem;
        }
        return null;
      }),
    },
    EventEmitter,
    DeviceEventEmitter: new EventEmitter(),
  };
});

// 3. Mock globalThis.expo for EventEmitter (used by newer expo modules)
const MockEventEmitter = class {
  addListener = vi.fn(() => ({ remove: vi.fn() }));
  removeListeners = vi.fn();
  removeAllListeners = vi.fn();
  emit = vi.fn();
};

const mockFileSystem = {
  downloadAsync: vi.fn(),
  getInfoAsync: vi.fn(),
  readAsStringAsync: vi.fn(),
  writeAsStringAsync: vi.fn(),
  deleteAsync: vi.fn(),
  makeDirectoryAsync: vi.fn(),
  copyAsync: vi.fn(),
  FileSystemFile: class {},
  FileSystemDirectory: class {},
};

(globalThis as any).expo = {
  EventEmitter: MockEventEmitter,
  modules: {
    ExpoFileSystem: mockFileSystem,
    FileSystem: mockFileSystem,
  }
};

// 4. Mock expo-constants
vi.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      name: 'Mariner AI Grid',
      slug: 'mariners-ai-grid',
    },
  },
}));
