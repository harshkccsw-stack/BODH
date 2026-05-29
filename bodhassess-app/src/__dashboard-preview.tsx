// THROWAWAY preview harness — renders the dashboard in isolation with stubbed
// API data so it can be screenshotted without a running backend. Delete this
// file and dashboard-preview.html when done.
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import '@/styles/globals.css';

const today = new Date();
const daysAgo = (n: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

const instruments = ['Beck Depression Inventory', 'GAD-7', 'PHQ-9', 'WAIS-IV', 'MMPI-2'];
const statuses = ['Completed', 'Completed', 'Active', 'Pending Review', 'Completed', 'Active'];

const summaries = Array.from({ length: 48 }, (_, i) => {
  const status = statuses[i % statuses.length];
  return {
    id: 'A' + (1000 + i),
    respondentName: 'Client ' + i,
    instrument: instruments[i % instruments.length],
    vertical: 'clinical',
    status,
    score: String(40 + (i % 50)),
    createdAt: daysAgo((i % 14) + 1),
    // Only completed sessions carry a completedAt — spread across the window.
    completedAt: status === 'Completed' ? daysAgo(i % 14) : undefined,
  };
});
const respondents = Array.from({ length: 132 }, (_, i) => ({ id: 'R' + i, verticals: ['clinical'] }));
const practitioners = Array.from({ length: 14 }, (_, i) => ({ id: 'P' + i, verticals: ['clinical'] }));
const questionnaires = instruments.map((n, i) => ({ id: 'Q' + i, name: n, vertical: 'clinical' }));
const health = { status: 'ok', service: 'bodhassess-api', version: 'v1.0.0', database: true, time: today.toISOString() };

const orig = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const json = (data: unknown) =>
    new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  if (url.includes('/health')) return json(health);
  if (url.includes('/assessments/summaries')) return json(summaries);
  if (url.includes('/respondents')) return json(respondents);
  if (url.includes('/practitioners')) return json(practitioners);
  if (url.includes('/questionnaires-catalog')) return json(questionnaires);
  return orig(input, init);
};

const { default: DashboardPage } = await import('@/src/pages/dashboard');

createRoot(document.getElementById('root')!).render(
  <MemoryRouter initialEntries={['/dashboard?vertical=clinical']}>
    <DashboardPage />
  </MemoryRouter>,
);
