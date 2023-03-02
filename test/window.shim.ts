// eslint-disable-next-line import/no-mutable-exports
let windowShim: any;

try {
  windowShim = window || {
    addEventListener: () => {
      return false;
    },
    removeEventListener: () => {
      return false;
    },
  };
} catch (e) {
  windowShim = {
    addEventListener: () => {
      return false;
    },
    removeEventListener: () => {
      return false;
    },
  };
}

export default windowShim;
