let createWebdavClientPromise: Promise<any> | null = null;
let markdownRuntimePromise: Promise<any> | null = null;

const getCreateWebdavClient = async () => {
  if (!createWebdavClientPromise) {
    createWebdavClientPromise = import('webdav/web').then((module) => module.createClient);
  }
  return createWebdavClientPromise;
};

export const createWebdavClient = async (url: string, username: string, password: string) => {
  const createClient = await getCreateWebdavClient();
  return createClient(url, { username, password });
};

export const getMarkdownRuntime = async () => {
  if (!markdownRuntimePromise) {
    markdownRuntimePromise = Promise.all([import('marked'), import('dompurify')]).then(
      ([markedModule, domPurifyModule]) => ({
        marked: markedModule.marked,
        DOMPurify: domPurifyModule.default || domPurifyModule,
      }),
    );
  }
  return markdownRuntimePromise;
};
