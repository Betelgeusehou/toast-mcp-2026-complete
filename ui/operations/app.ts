import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
} from '@modelcontextprotocol/ext-apps/app-with-deps';
import './styles.css';

type HostContext = NonNullable<ReturnType<App['getHostContext']>>;

interface OverviewResult {
  context: {
    dataSource: 'demo' | 'live';
    verificationState: string;
    generatedAt: string;
  };
  overview: {
    location: { name: string; locationName?: string; currencyCode?: string };
    period: { startDate: string; endDate: string };
    metrics: {
      orderCount: number;
      grossSales: number;
      averageCheck: number;
      openChecks: number;
      inventoryRisks: number;
    };
    topItems: Array<{ name: string; quantity: number }>;
    inventory: Array<{
      guid: string;
      status: string;
      quantity: number | null;
    }>;
    recentOrders: Array<{
      guid: string;
      displayNumber: string;
      openedDate: string;
      status: string;
      totalAmount: number;
    }>;
  };
}

const appRoot = document.querySelector<HTMLElement>('#app');
if (!appRoot) throw new Error('App root was not found');
const root: HTMLElement = appRoot;

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  value?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
}

function currency(value: number, code = 'USD'): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: code,
    maximumFractionDigits: 2,
  }).format(value);
}

function date(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function applyContext(context: HostContext | undefined): void {
  if (!context) return;
  if (context.theme) applyDocumentTheme(context.theme);
  if (context.styles?.variables) {
    applyHostStyleVariables(context.styles.variables);
  }
  if (context.styles?.css?.fonts) applyHostFonts(context.styles.css.fonts);
  const insets = context.safeAreaInsets;
  if (insets) {
    document.documentElement.style.setProperty('--safe-top', `${insets.top}px`);
    document.documentElement.style.setProperty('--safe-right', `${insets.right}px`);
    document.documentElement.style.setProperty('--safe-bottom', `${insets.bottom}px`);
    document.documentElement.style.setProperty('--safe-left', `${insets.left}px`);
  }
}

function renderError(message: string): void {
  root.replaceChildren();
  const card = element('section', 'state-card error-card');
  card.append(
    element('span', 'status-dot'),
    element('h2', undefined, 'Could not load operations'),
    element('p', undefined, message),
  );
  root.append(card);
}

function renderMetric(label: string, value: string, detail: string): HTMLElement {
  const card = element('article', 'metric-card');
  card.append(
    element('p', 'eyebrow', label),
    element('strong', 'metric-value', value),
    element('span', 'metric-detail', detail),
  );
  return card;
}

function render(result: OverviewResult): void {
  const { context, overview } = result;
  const code = overview.location.currencyCode ?? 'USD';
  root.replaceChildren();

  const header = element('header', 'hero');
  const heading = element('div');
  heading.append(
    element('p', 'eyebrow', 'Restaurant operations'),
    element('h1', undefined, overview.location.name),
    element(
      'p',
      'subhead',
      `${date(overview.period.startDate)} – ${date(overview.period.endDate)}`,
    ),
  );
  const badge = element(
    'span',
    `mode-badge ${context.dataSource}`,
    context.dataSource === 'demo' ? 'Demo data' : 'Live credentials',
  );
  header.append(heading, badge);

  const metrics = element('section', 'metric-grid');
  metrics.setAttribute('aria-label', 'Operations metrics');
  metrics.append(
    renderMetric(
      'Gross sales',
      currency(overview.metrics.grossSales, code),
      `${overview.metrics.orderCount} non-voided orders`,
    ),
    renderMetric(
      'Average check',
      currency(overview.metrics.averageCheck, code),
      `${overview.metrics.openChecks} currently open`,
    ),
    renderMetric(
      'Inventory risks',
      String(overview.metrics.inventoryRisks),
      'Quantity or out-of-stock items',
    ),
  );

  const split = element('section', 'content-grid');
  const topCard = element('article', 'panel');
  topCard.append(element('h2', undefined, 'Top items'));
  const bars = element('div', 'bars');
  const highest = Math.max(1, ...overview.topItems.map((item) => item.quantity));
  if (overview.topItems.length === 0) {
    bars.append(element('p', 'empty', 'No item activity in this period.'));
  }
  for (const item of overview.topItems) {
    const row = element('div', 'bar-row');
    const label = element('div', 'bar-label');
    label.append(element('span', undefined, item.name), element('strong', undefined, String(item.quantity)));
    const track = element('div', 'bar-track');
    const fill = element('span', 'bar-fill');
    fill.style.width = `${Math.max(8, (item.quantity / highest) * 100)}%`;
    track.append(fill);
    row.append(label, track);
    bars.append(row);
  }
  topCard.append(bars);

  const inventoryCard = element('article', 'panel');
  inventoryCard.append(element('h2', undefined, 'Inventory watch'));
  const inventoryList = element('ul', 'inventory-list');
  if (overview.inventory.length === 0) {
    inventoryList.append(element('li', 'empty', 'No at-risk inventory returned.'));
  }
  for (const item of overview.inventory.slice(0, 6)) {
    const row = element('li');
    row.append(
      element('span', 'item-guid', `…${item.guid.slice(-8)}`),
      element('span', `stock-pill ${item.status.toLocaleLowerCase()}`, item.status.replaceAll('_', ' ')),
      element('strong', undefined, item.quantity === null ? '—' : String(item.quantity)),
    );
    inventoryList.append(row);
  }
  inventoryCard.append(inventoryList);
  split.append(topCard, inventoryCard);

  const ordersCard = element('section', 'panel orders-panel');
  ordersCard.append(element('h2', undefined, 'Recent orders'));
  const tableWrap = element('div', 'table-wrap');
  const table = element('table');
  const thead = element('thead');
  const headRow = element('tr');
  for (const label of ['Order', 'Opened', 'Status', 'Total']) {
    headRow.append(element('th', undefined, label));
  }
  thead.append(headRow);
  const tbody = element('tbody');
  for (const order of overview.recentOrders) {
    const row = element('tr');
    const statusCell = element('td');
    statusCell.append(
      element('span', `order-status ${order.status.toLocaleLowerCase()}`, order.status),
    );
    row.append(
      element('td', 'order-number', `#${order.displayNumber}`),
      element('td', undefined, date(order.openedDate)),
      statusCell,
      element('td', 'money', currency(order.totalAmount, code)),
    );
    tbody.append(row);
  }
  table.append(thead, tbody);
  tableWrap.append(table);
  ordersCard.append(tableWrap);

  const footer = element('footer');
  footer.append(
    element(
      'p',
      undefined,
      context.dataSource === 'demo'
        ? 'Synthetic demonstration data — no Toast account was contacted.'
        : 'Customer-supplied credentials — read-only, privacy-minimized output.',
    ),
    element('span', undefined, `Generated ${date(context.generatedAt)}`),
  );

  root.append(header, metrics, split, ordersCard, footer);
}

function isOverviewResult(value: unknown): value is OverviewResult {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<OverviewResult>;
  return Boolean(candidate.context?.dataSource && candidate.overview?.metrics);
}

const app = new App(
  { name: 'toast-operations-overview', version: '2.0.0-beta.1' },
  {},
  { autoResize: true },
);

app.ontoolinput = () => {
  root.setAttribute('aria-busy', 'true');
};
app.ontoolresult = (params) => {
  root.removeAttribute('aria-busy');
  if (params.isError) {
    renderError('The Toast MCP tool returned an error. Check the conversation for details.');
    return;
  }
  if (isOverviewResult(params.structuredContent)) {
    render(params.structuredContent);
  } else {
    renderError('The tool returned an unexpected data shape.');
  }
};
app.onhostcontextchanged = applyContext;
app.onteardown = async () => ({});

app
  .connect()
  .then(() => applyContext(app.getHostContext()))
  .catch((error: unknown) => {
    renderError(error instanceof Error ? error.message : 'Unable to connect to the MCP host.');
  });
