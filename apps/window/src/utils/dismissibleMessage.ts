import { ElMessage } from 'element-plus';

export const createDismissibleMessage = () => {
  const showDismissibleMessage = (options: any) => {
    const opts = typeof options === 'string' ? { message: options } : options;
    const duration = opts.duration !== undefined ? opts.duration : 1000;

    let messageInstance: any = null;
    const finalOpts = {
      ...opts,
      duration,
      showClose: false,
      grouping: true,
      offset: 40,
      onClick: () => {
        if (messageInstance) {
          messageInstance.close();
        }
      },
    };
    messageInstance = ElMessage(finalOpts);
  };

  (showDismissibleMessage as any).success = (message: string) =>
    showDismissibleMessage({ message, type: 'success' });
  (showDismissibleMessage as any).error = (message: string) =>
    showDismissibleMessage({ message, type: 'error' });
  (showDismissibleMessage as any).info = (message: string) =>
    showDismissibleMessage({ message, type: 'info' });
  (showDismissibleMessage as any).warning = (message: string) =>
    showDismissibleMessage({ message, type: 'warning' });

  return showDismissibleMessage as any;
};
