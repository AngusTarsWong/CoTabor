import { Page as BasePage } from '../puppeteer/base-page';
export class WebPage extends BasePage {
    playwrightFileChooserHandler;
    constructor(page, opts) {
        super(page, 'playwright', opts);
    }
    async registerFileChooserListener(handler) {
        const page = this.underlyingPage;
        let capturedError;
        this.playwrightFileChooserHandler = async (chooser) => {
            try {
                await handler({
                    accept: async (files) => {
                        await chooser.setFiles(files);
                    },
                });
            }
            catch (error) {
                capturedError = error;
            }
        };
        page.on('filechooser', this.playwrightFileChooserHandler);
        return {
            dispose: () => {
                if (this.playwrightFileChooserHandler) {
                    page.off('filechooser', this.playwrightFileChooserHandler);
                    this.playwrightFileChooserHandler = undefined;
                }
            },
            getError: () => capturedError,
        };
    }
}
