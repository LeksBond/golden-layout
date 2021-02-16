import { LayoutConfig } from './config/config';
import { ResolvedLayoutConfig, ResolvedPopoutLayoutConfig } from './config/resolved-config';
import { LayoutManager } from './layout-manager';
import { DomConstants } from './utils/dom-constants';
import { getQueryStringParam } from './utils/utils';

/** @public */
export class GoldenLayout extends LayoutManager {
    /** @internal */
    private _subWindowsCreated = false;
    /** @internal */
    private _creationTimeoutPassed = false;

    /**
    * @param container - A Dom HTML element. Defaults to body
    */
   constructor(container?: HTMLElement);
   /** @deprecated specify layoutConfig in {@link (LayoutManager:class).loadLayout} */
   constructor(config: LayoutConfig, container?: HTMLElement);
   /** @internal */
   constructor(configOrOptionalContainer: LayoutConfig | HTMLElement | undefined, container?: HTMLElement) {
        super(GoldenLayout.createConfig(configOrOptionalContainer, container));

        if (this.isSubWindow) {
            document.body.style.visibility = 'hidden';
        }

        if (this.layoutConfig.root === undefined || this.isSubWindow) {
            this.init();
        }
    }

    /**
     * Creates the actual layout. Must be called after all initial components
     * are registered. Recurses through the configuration and sets up
     * the item tree.
     *
     * If called before the document is ready it adds itself as a listener
     * to the document.ready event
     * @deprecated LayoutConfig should not be loaded in {@link (LayoutManager:class)} constructor, but rather in a
     * {@link (LayoutManager:class).loadLayout} call.  If LayoutConfig is not specified in {@link (LayoutManager:class)} constructor, 
     * then init() will be automatically called internally and should not be called externally.
     */
    init(): void {
        /**
         * Create the popout windows straight away. If popouts are blocked
         * an error is thrown on the same 'thread' rather than a timeout and can
         * be caught. This also prevents any further initilisation from taking place.
         */
        if (this._subWindowsCreated === false) {
            this.createSubWindows();
            this._subWindowsCreated = true;
        }


        /**
         * If the document isn't ready yet, wait for it.
         */
        if (document.readyState === 'loading' || document.body === null) {
            document.addEventListener('DOMContentLoaded', () => this.init(), { passive: true });
            return;
        }

        /**
         * If this is a subwindow, wait a few milliseconds for the original
         * page's js calls to be executed, then replace the bodies content
         * with GoldenLayout
         */
        if (this.isSubWindow === true && this._creationTimeoutPassed === false) {
            setTimeout(() => this.init(), 7);
            this._creationTimeoutPassed = true;
            return;
        }

        if (this.isSubWindow === true) {
            this.adjustToWindowMode();
        }

        super.init();
    }


    /**
     * Creates Subwindows (if there are any). Throws an error
     * if popouts are blocked.
     * @internal
     */
    private createSubWindows() {
        for (let i = 0; i < this.layoutConfig.openPopouts.length; i++) {
            const popoutConfig = this.layoutConfig.openPopouts[i];
            this.createPopoutFromPopoutLayoutConfig(popoutConfig);
        }
    }

    /**
     * This is executed when GoldenLayout detects that it is run
     * within a previously opened popout window.
     * @internal
     */
    private adjustToWindowMode() {
        const popInButtonElement = document.createElement('div');
        popInButtonElement.classList.add(DomConstants.ClassName.Popin);
        popInButtonElement.setAttribute('title', this.layoutConfig.header.dock);
        const iconElement = document.createElement('div');
        iconElement.classList.add(DomConstants.ClassName.Icon);
        const bgElement = document.createElement('div');
        bgElement.classList.add(DomConstants.ClassName.Bg);
        popInButtonElement.appendChild(iconElement);
        popInButtonElement.appendChild(bgElement);

        popInButtonElement.click = () => this.emit('popIn');

        const headElement = document.head;

        const appendNodeLists = new Array<NodeListOf<Element>>(4);
        appendNodeLists[0] = document.querySelectorAll('body link');
        appendNodeLists[1] = document.querySelectorAll('body style');
        appendNodeLists[2] = document.querySelectorAll('template');
        appendNodeLists[3] = document.querySelectorAll('.gl_keep');

        for (let listIdx = 0; listIdx < appendNodeLists.length; listIdx++) {
            const appendNodeList = appendNodeLists[listIdx];
            for (let nodeIdx = 0; nodeIdx < appendNodeList.length; nodeIdx++) {
                const node = appendNodeList[nodeIdx];
                headElement.appendChild(node);
            }
        }

        const bodyElement = document.body;
        bodyElement.innerHTML = '';
        bodyElement.style.visibility = 'visible';
        bodyElement.appendChild(popInButtonElement);

        /*
        * This seems a bit pointless, but actually causes a reflow/re-evaluation getting around
        * slickgrid's "Cannot find stylesheet." bug in chrome
        */
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const x = document.body.offsetHeight;

        /*
        * Expose this instance on the window object
        * to allow the opening window to interact with
        * it
        */
        window.__glInstance = this;
    }
}

/** @public */
export namespace GoldenLayout {
    /** @internal */
    export function createConfig(configOrOptionalContainer: LayoutConfig | HTMLElement | undefined,
        containerElement?: HTMLElement):
        LayoutManager.ConstructorParameters
    {
        const windowConfigKey = getQueryStringParam('gl-window');
        const isSubWindow = windowConfigKey !== null;  

        let config: ResolvedLayoutConfig | undefined;
        if (windowConfigKey !== null) {
            const windowConfigStr = localStorage.getItem(windowConfigKey);
            if (windowConfigStr === null) {
                throw new Error('Null gl-window Config');
            }
            localStorage.removeItem(windowConfigKey);
            const minifiedWindowConfig = JSON.parse(windowConfigStr) as ResolvedPopoutLayoutConfig;
            config = ResolvedLayoutConfig.unminifyConfig(minifiedWindowConfig);
        } else {
            if (configOrOptionalContainer === undefined) {
                config = undefined;
            } else {
                if (configOrOptionalContainer instanceof HTMLElement) {
                    config = undefined;
                    containerElement = configOrOptionalContainer;
                } else {
                    if (LayoutConfig.isResolved(configOrOptionalContainer)) {
                        config = configOrOptionalContainer as ResolvedLayoutConfig;
                    } else {
                        config = LayoutConfig.resolve(configOrOptionalContainer);
                    }
                }
            }
        }

        return {
            layoutConfig: config,
            isSubWindow,
            containerElement,
        };
    }
}
