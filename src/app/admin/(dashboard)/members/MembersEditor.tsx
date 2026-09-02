'use client';

import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  MEMBER_GROUPS,
  MEMBER_GROUP_LABELS,
  PROFILE_KEYS,
  slugify,
  type Member,
  type MemberGroup,
  type MembersContent,
} from '@/lib/content-types';
import { AdminPageHeader, EmptyState, ItemCard, SaveBar } from '@/components/admin/EditorChrome';
import { FieldSection, TextAreaField, TextField } from '@/components/admin/fields';
import { ImageField } from '@/components/admin/ImageField';
import { moveBy, removeAt, replaceAt, useContentEditor } from '@/components/admin/useContentEditor';

const PROFILE_LABELS: Record<(typeof PROFILE_KEYS)[number], string> = {
  googleScholar: 'Google Scholar',
  orcid: 'ORCID',
  linkedin: 'LinkedIn',
  researchgate: 'ResearchGate',
};

/** Alumni photos live in a different folder from current members. */
const destinationFor = (group: MemberGroup) => (group === 'alumni' ? 'alumni' : 'members');

function emptyMember(): Member {
  return { id: '', name: '', title: '', email: '' };
}

function MemberForm({
  member,
  group,
  onChange,
}: {
  member: Member;
  group: MemberGroup;
  onChange: (member: Member) => void;
}) {
  const set = <K extends keyof Member>(key: K, value: Member[K]) =>
    onChange({ ...member, [key]: value });

  const isAlumnus = group === 'alumni';

  return (
    <>
      <FieldSection title="Identity">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Full name"
            value={member.name}
            onChange={(value) => set('name', value)}
            placeholder="Dr. Jane Doe"
          />
          <TextField
            label="Role / title"
            value={member.title}
            onChange={(value) => set('title', value)}
            placeholder={isAlumnus ? 'Research Scholar (2024)' : 'Research Scholar'}
          />
        </div>

        <TextField
          label="Page anchor"
          value={member.id}
          onChange={(value) => set('id', slugify(value))}
          hint={`Links point here as /members#${member.id || 'anchor'}. Changing it breaks any link already shared.`}
        />

        <ImageField
          label="Photo"
          value={member.image ?? ''}
          onChange={(value) => set('image', value)}
          destination={destinationFor(group)}
          nameHint={member.id || slugify(member.name)}
        />
      </FieldSection>

      <FieldSection title="Contact">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Email"
            value={member.email}
            onChange={(value) => set('email', value)}
            placeholder="name@iitkgp.ac.in"
            hint="Separate two addresses with a comma."
          />
          <TextField
            label="Phone"
            value={member.phone ?? ''}
            onChange={(value) => set('phone', value)}
            placeholder="+91 03222 282221"
          />
        </div>
      </FieldSection>

      {isAlumnus ? (
        <FieldSection title="After CBRL">
          <TextAreaField
            label="Current position"
            value={member.currentPosition ?? ''}
            onChange={(value) => set('currentPosition', value)}
            rows={2}
            placeholder="Assistant Professor, Department of…"
          />
          <TextAreaField
            label="Thesis title"
            value={member.thesisTitle ?? ''}
            onChange={(value) => set('thesisTitle', value)}
            rows={3}
          />
          <TextField
            label="Research area"
            value={member.research ?? ''}
            onChange={(value) => set('research', value)}
          />
        </FieldSection>
      ) : (
        <FieldSection title="Work at the lab">
          <TextField
            label="Research focus"
            value={member.research ?? ''}
            onChange={(value) => set('research', value)}
            placeholder="Lung cancer pathogenesis"
            hint="On the PI card this is split into tags at each comma."
          />
          <TextAreaField
            label="Bio"
            value={member.bio ?? ''}
            onChange={(value) => set('bio', value)}
            rows={4}
          />
          <TextAreaField
            label="Responsibilities"
            value={member.responsibilities ?? ''}
            onChange={(value) => set('responsibilities', value)}
            rows={3}
            hint="Shown for staff and project fellows."
          />
          <TextField
            label="Joined"
            value={member.joinedDate ?? ''}
            onChange={(value) => set('joinedDate', value)}
            placeholder="2025-09"
            hint="Year and month, as YYYY-MM."
          />
          <TextAreaField
            label="Qualifications"
            value={member.qualifications ?? ''}
            onChange={(value) => set('qualifications', value)}
            rows={5}
            hint="One per line as “Degree: Institution”, separated by a blank line."
          />
        </FieldSection>
      )}

      <FieldSection title="Academic profiles" description="Leave blank to hide the icon.">
        <div className="grid gap-4 sm:grid-cols-2">
          {PROFILE_KEYS.map((key) => (
            <TextField
              key={key}
              label={PROFILE_LABELS[key]}
              value={member.profiles?.[key] ?? ''}
              onChange={(value) =>
                set('profiles', { ...(member.profiles ?? {}), [key]: value })
              }
              placeholder="https://…"
            />
          ))}
        </div>
      </FieldSection>
    </>
  );
}

export default function MembersEditor({ initial }: { initial: MembersContent }) {
  const editor = useContentEditor<MembersContent>(initial, '/api/admin/content/members');
  const { draft, setDraft } = editor;

  const [group, setGroup] = useState<MemberGroup>('faculty');
  const [query, setQuery] = useState('');

  const list = useMemo(() => draft[group] ?? [], [draft, group]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list.map((member, index) => ({ member, index }));
    return list
      .map((member, index) => ({ member, index }))
      .filter(
        ({ member }) =>
          member.name.toLowerCase().includes(q) ||
          member.title.toLowerCase().includes(q) ||
          (member.research ?? '').toLowerCase().includes(q)
      );
  }, [list, query]);

  const update = (next: Member[]) => setDraft({ ...draft, [group]: next });

  return (
    <div className="pb-4">
      <AdminPageHeader
        eyebrow="People"
        title="Members"
        lead="Faculty, postdocs, research scholars, staff and alumni, in the order they appear on the members page."
        page="/members"
        actions={
          <Button size="sm" onClick={() => update([emptyMember(), ...list])}>
            <Plus className="h-3.5 w-3.5" />
            Add to {MEMBER_GROUP_LABELS[group].toLowerCase()}
          </Button>
        }
      />

      {/* Group switcher — the understated text chips used across the site. */}
      <div className="flex flex-col gap-4 border-b py-5 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
            Group
          </span>
          {MEMBER_GROUPS.map((key) => {
            const active = key === group;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => setGroup(key)}
                className={cn(
                  'text-[11px] font-medium uppercase tracking-wider underline-offset-4 transition-colors',
                  active
                    ? 'text-primary underline'
                    : 'text-muted-foreground hover:text-foreground hover:underline'
                )}
              >
                {MEMBER_GROUP_LABELS[key]}
                <span className="ml-1.5 tabular-nums opacity-60">{draft[key].length}</span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full md:w-64">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter this group"
            className="pl-9"
          />
        </div>
      </div>

      <div className="space-y-3 py-6">
        {visible.length === 0 ? (
          <EmptyState>
            {query ? 'No one in this group matches that filter.' : 'This group is empty.'}
          </EmptyState>
        ) : (
          visible.map(({ member, index }) => (
            <ItemCard
              key={`${group}-${index}`}
              index={index}
              total={list.length}
              title={member.name}
              subtitle={member.title}
              badge={
                !member.image ? (
                  <Badge variant="outline" className="font-normal text-muted-foreground">
                    No photo
                  </Badge>
                ) : undefined
              }
              defaultOpen={!member.name}
              onMove={(delta) => update(moveBy(list, index, delta))}
              onRemove={() => update(removeAt(list, index))}
            >
              <MemberForm
                member={member}
                group={group}
                onChange={(next) => update(replaceAt(list, index, next))}
              />
            </ItemCard>
          ))
        )}
      </div>

      <SaveBar
        dirty={editor.dirty}
        state={editor.state}
        error={editor.error}
        issues={editor.issues}
        savedAt={editor.savedAt}
        onSave={editor.save}
        onRevert={editor.revert}
      />
    </div>
  );
}
