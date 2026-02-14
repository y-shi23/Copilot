declare const utools: {
  [key: string]: any;
  db: {
    get: (...args: any[]) => any;
    put: (...args: any[]) => any;
    remove: (...args: any[]) => any;
    promises: {
      get: (...args: any[]) => Promise<any>;
      put: (...args: any[]) => Promise<any>;
      remove: (...args: any[]) => Promise<any>;
      postAttachment: (...args: any[]) => Promise<any>;
      getAttachment: (...args: any[]) => Promise<any>;
    };
  };
};
