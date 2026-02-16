let markdownRuntimePromise: Promise<any> | null = null;

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
