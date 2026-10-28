// Mounts the shared Project Copilot (repo themovingdot/website-copilot) on the homepage.
// The widget and API live on the Copilot Worker; the homepage adapter is sites/homepage.mjs there.
const BASE = 'https://project-copilot-staging.zhwlxl.workers.dev';   // switch to the production Worker once it serves /v1/

const css = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: BASE + '/v1/floating-copilot.css' });
document.head.append(css);

const { mountProjectCopilot } = await import(BASE + '/v1/copilot-connect.js');

const LINKS = { transport: 'https://transport.themovingdot.com', email: 'mailto:info@themovingdot.com' };

mountProjectCopilot({
    endpoint: BASE + '/api/copilot',
    siteId: 'homepage',
    title: 'the dot',
    subtitle: 'COPILOT · DRAG TO MOVE',
    greeting: "Hi, I'm the dot. Ask me what we do, or tell me what you need.",
    placeholder: 'Ask anything…',
    storageKey: 'copilot-homepage',
    suggestions: ['What do you do?', 'I need a transport model', 'Contact you'],
    theme: { accent: '#8b45c5', 'accent-2': '#3498db' },
    getContext: () => ({ page: document.title, url: location.pathname }),
    actions: {
        open_link: {
            label: 'Open',
            args: { id: { type: 'string', enum: Object.keys(LINKS), required: true } },
            run: ({ id }) => {
                if (!LINKS[id]) throw new Error('unknown link');
                window.open(LINKS[id], id === 'email' ? '_self' : '_blank', 'noopener');
                return 'Opened ' + id;
            }
        }
    }
});
