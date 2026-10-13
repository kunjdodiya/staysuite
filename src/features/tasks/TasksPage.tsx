import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Sparkles, Wrench, ClipboardCheck, CheckCircle2, Circle, Image as ImageIcon, IndianRupee, Zap, Search as SearchIcon } from 'lucide-react';
import { PageHeader, Button, Card, Select, EmptyState, Segmented, Avatar, ProgressBar, Stat } from '@/components/ui';
import { PriorityBadge, PropertyDot, ReadinessBadge } from '@/components/domain';
import { useCan, useCurrentUser, useData, useLookup, useMoney, useToday, useVisiblePropertyIds } from '@/data/hooks';
import { useStore } from '@/data/store';
import { openOverlay } from '@/data/ui';
import { addDaysISO, relDay } from '@/lib/dates';
import { taskStatusLabel, taskTypeLabel, options } from '@/domain/labels';
import type { Task, TaskStatus, TaskType } from '@/domain/types';
import { cn } from '@/lib/cn';

const COLUMNS: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'done'];
const prio = { urgent: 0, high: 1, medium: 2, low: 3 };

export default function TasksPage() {
  const data = useData();
  const today = useToday();
  const user = useCurrentUser();
  const L = useLookup();
  const money = useMoney();
  const visible = useVisiblePropertyIds();
  const canEdit = useCan('tasks.edit');
  const setStatus = useStore((s) => s.setTaskStatus);
  const runAutomation = useStore((s) => s.runAutomation);
  const [params, setParams] = useSearchParams();
  const [type, setType] = useState<TaskType | ''>('');
  const [pid, setPid] = useState('');
  const [assignee, setAssignee] = useState<string>(user.role === 'cleaner' ? user.id : '');
  const [view, setView] = useState<'board' | 'list'>(() => (window.innerWidth < 900 ? 'list' : 'board'));
  const [showDone, setShowDone] = useState<'7d' | 'all'>('7d');

  useEffect(() => {
    const t = params.get('task');
    if (t) { openOverlay({ kind: 'task', taskId: t }); setParams({}, { replace: true }); }
  }, [params, setParams]);

  const tasks = useMemo(() => data.tasks
    .filter((t) => (!visible || visible.has(t.propertyId)) && (!type || t.type === type) && (!pid || t.propertyId === pid))
    .filter((t) => !assignee || (assignee === 'none' ? !t.assigneeId : t.assigneeId === assignee))
    .filter((t) => t.status !== 'done' || showDone === 'all' || (t.completedAt ?? '').slice(0, 10) >= addDaysISO(today, -7))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || prio[a.priority] - prio[b.priority]), [data.tasks, visible, type, pid, assignee, showDone, today]);

  const open = data.tasks.filter((t) => t.status !== 'done' && (!visible || visible.has(t.propertyId)));
  const units = data.units.filter((u) => !u.archived && (!visible || visible.has(u.propertyId)));

  const quick = (t: Task, s: TaskStatus) => {
    setStatus(t.id, s);
    if (s === 'done') toast.success('Task complete', { description: t.type === 'cleaning' && t.unitId ? `${L.unit(t.unitId)?.name} is ready for guests` : t.cost > 0 && !t.expenseId ? 'Record the repair cost from the task' : undefined });
  };

  const card = (t: Task) => {
    const done = t.checklist.filter((c) => c.done).length;
    const overdue = t.status !== 'done' && t.dueDate < today;
    const assigneeName = L.staff(t.assigneeId)?.name;
    const next = t.status === 'todo' ? 'in_progress' : t.status === 'in_progress' || t.status === 'blocked' ? 'done' : 'todo';
    return (
      <div key={t.id} className={cn('card p-3.5 hover:border-border-strong transition-colors cursor-pointer animate-fade-in', t.status === 'done' && 'opacity-60')} onClick={() => openOverlay({ kind: 'task', taskId: t.id })}>
        <div className="flex items-start gap-2.5">
          {canEdit && (
            <button className="mt-0.5 text-subtle hover:text-success shrink-0" onClick={(e) => { e.stopPropagation(); quick(t, t.status === 'done' ? 'todo' : 'done'); }} aria-label={t.status === 'done' ? 'Reopen' : 'Mark done'}>
              {t.status === 'done' ? <CheckCircle2 className="h-[18px] w-[18px] text-success" /> : <Circle className="h-[18px] w-[18px]" />}
            </button>
          )}
          <div className="min-w-0 flex-1">
            <div className={cn('text-[13.5px] font-medium leading-snug', t.status === 'done' && 'line-through')}>{t.title}</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
              <span className="flex items-center gap-1"><PropertyDot color={L.property(t.propertyId)?.color ?? 's1'} className="!h-2 !w-2" />{L.unit(t.unitId)?.name ?? L.property(t.propertyId)?.name}</span>
              <span className={overdue ? 'text-danger font-medium' : ''}>{relDay(t.dueDate, today)}{t.dueTime ? ` ${t.dueTime}` : ''}</span>
            </div>
          </div>
          {t.type === 'cleaning' ? <Sparkles className="h-4 w-4 text-s1 shrink-0" /> : t.type === 'maintenance' ? <Wrench className="h-4 w-4 text-s2 shrink-0" /> : <ClipboardCheck className="h-4 w-4 text-subtle shrink-0" />}
        </div>
        {t.checklist.length > 0 && <div className="mt-3 flex items-center gap-2"><ProgressBar value={done / t.checklist.length} tone={done === t.checklist.length ? 'success' : 'accent'} className="flex-1" /><span className="text-[11px] text-subtle num">{done}/{t.checklist.length}</span></div>}
        <div className="mt-3 flex items-center gap-2">
          {assigneeName ? <span className="flex items-center gap-1.5 text-[12px] text-muted"><Avatar name={assigneeName} size={20} />{assigneeName.split(' ')[0]}</span> : <span className="text-[12px] text-subtle">Unassigned</span>}
          <div className="ml-auto flex items-center gap-1.5">
            {t.photos.length > 0 && <ImageIcon className="h-3.5 w-3.5 text-subtle" />}
            {t.cost > 0 && <span className="text-[11.5px] text-muted num flex items-center gap-0.5"><IndianRupee className="h-3 w-3" />{money(t.cost, { compact: true }).replace(/^[^\d]+/, '')}</span>}
            {t.auto && <Zap className="h-3.5 w-3.5 text-subtle" aria-label="Auto-created" />}
            {t.priority !== 'medium' && <PriorityBadge value={t.priority} />}
          </div>
        </div>
        {canEdit && t.status !== 'done' && view === 'list' && (
          <div className="mt-3 flex gap-1.5" onClick={(e) => e.stopPropagation()}>
            <Button size="sm" onClick={() => quick(t, next)}>{next === 'in_progress' ? 'Start' : 'Complete'}</Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <PageHeader title="Tasks" subtitle="Housekeeping, maintenance and property readiness"
        actions={canEdit && <>
          <Button icon={<Zap className="h-4 w-4" />} onClick={() => { const n = runAutomation(); toast.success(n ? `Created ${n} cleaning task${n > 1 ? 's' : ''}` : 'Cleaning tasks are up to date', { description: 'Turnover cleans are generated from upcoming check-outs.' }); }}>Sync cleans</Button>
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => openOverlay({ kind: 'task', type: 'maintenance' })}>New task</Button>
        </>} />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mb-5">
        <Stat label="Due today" value={String(open.filter((t) => t.dueDate === today).length)} />
        <Stat label="Overdue" value={<span className={open.some((t) => t.dueDate < today) ? 'text-danger' : ''}>{open.filter((t) => t.dueDate < today).length}</span>} />
        <Stat label="Open maintenance" value={String(open.filter((t) => t.type === 'maintenance').length)} sub={`${open.filter((t) => t.type === 'maintenance' && (t.priority === 'urgent' || t.priority === 'high')).length} high priority`} />
        <Stat label="Units ready" value={`${units.filter((u) => u.readiness === 'ready').length}/${units.length}`} />
      </div>

      <Card className="p-4 sm:p-5 mb-5">
        <div className="eyebrow mb-3">Readiness</div>
        <div className="flex flex-wrap gap-2">
          {units.map((u) => (
            <div key={u.id} className="flex items-center gap-2 pl-2.5 pr-1.5 py-1.5 rounded-xl border border-border bg-surface-2/40">
              <PropertyDot color={L.property(u.propertyId)?.color ?? 's1'} />
              <span className="text-[12.5px] font-medium">{u.name}</span>
              <ReadinessBadge value={u.readiness} />
            </div>
          ))}
        </div>
      </Card>

      <div className="flex flex-wrap gap-2 mb-4">
        <Segmented size="sm" value={view} onChange={setView} options={[{ value: 'board', label: 'Board' }, { value: 'list', label: 'List' }]} />
        <Select className="w-36" value={type} onChange={setType} options={options(taskTypeLabel)} placeholder="All types" />
        {data.properties.length > 1 && <Select className="w-44" value={pid} onChange={setPid} options={data.properties.map((p) => ({ value: p.id, label: p.name }))} placeholder="All properties" />}
        <Select className="w-40" value={assignee} onChange={setAssignee} options={[{ value: 'none', label: 'Unassigned' }, ...data.staff.map((s) => ({ value: s.id, label: s.id === user.id ? 'My tasks' : s.name }))]} placeholder="Everyone" />
        <Segmented size="sm" value={showDone} onChange={setShowDone} options={[{ value: '7d', label: 'Done: last 7 days' }, { value: 'all', label: 'All done' }]} />
      </div>

      {tasks.length === 0 ? <Card><EmptyState icon={<SearchIcon className="h-5 w-5" />} title="No tasks" body="Turnover cleans are created automatically from check-outs. Add maintenance requests as they come up." /></Card> : view === 'board' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {COLUMNS.map((col) => {
            const list = tasks.filter((t) => t.status === col);
            return (
              <div key={col} className="rounded-2xl bg-surface-2/50 border border-border p-2.5 min-h-[120px]"
                onDragOver={(e) => canEdit && e.preventDefault()}
                onDrop={(e) => { const id = e.dataTransfer.getData('text/task'); const t = data.tasks.find((x) => x.id === id); if (t && t.status !== col) quick(t, col); }}>
                <div className="flex items-center justify-between px-1.5 pb-2.5 pt-1">
                  <span className="text-[12.5px] font-semibold text-muted">{taskStatusLabel[col]}</span>
                  <span className="text-[11.5px] text-subtle num">{list.length}</span>
                </div>
                <div className="space-y-2">
                  {list.map((t) => <div key={t.id} draggable={canEdit} onDragStart={(e) => e.dataTransfer.setData('text/task', t.id)}>{card(t)}</div>)}
                  {list.length === 0 && <div className="text-center text-[12px] text-subtle py-6">Drop tasks here</div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">{tasks.map(card)}</div>
      )}
    </div>
  );
}
