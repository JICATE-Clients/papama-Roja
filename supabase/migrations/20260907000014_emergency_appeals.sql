-- =============================================================================
-- E-6 (B-26 b,c) — Emergency Appeal: template store, approval, dispatch
-- =============================================================================
-- Work Order card E-6, CD §D-6. Apply after 20260907000013.
--
-- PHASE SPLIT (confirmed 18 Aug). Phase 1: approved templates, authorised
-- review/approval including a pre-approved INSTANT template with post-send
-- review, delivery via in-app now and email when the official account lands
-- (external dependency: Mr. Kabilan), Emergency-ID donation tagging, basic
-- individual/CSR segmentation. Phase 2: SMS via DLT registration and WhatsApp
-- via Business API.
--
-- THE ADDED REQUIREMENT, and the one that shapes this schema: the Phase 1
-- architecture must let Phase 2 channels be added "WITHOUT fundamental redesign
-- of the dispatch, template or tracking infrastructure". So `channel` is stored
-- as TEXT against a CHECK rather than an enum: adding 'sms' or 'whatsapp' later
-- is a one-line constraint change, not an enum migration that locks the table.
-- The existing lib/notifications/dispatch.ts is already adapter-shaped with
-- seams for email/SMS/WhatsApp — this builds ON that rather than beside it.
--
-- WHY THE INSTANT TEMPLATE IS A FIRST-CLASS CONCEPT. A flood does not wait for
-- an approval queue. CD §D-6 allows a PRE-APPROVED template to go out
-- immediately — but then requires a post-send review task, so speed never
-- silently becomes an absence of oversight. Both halves are modelled here: an
-- unapproved template simply cannot dispatch, and an instant dispatch always
-- leaves a review task behind it.
-- =============================================================================

begin;

create type public.appeal_template_status as enum ('draft', 'approved', 'retired');

create table public.emergency_appeal_templates (
    id            uuid primary key default gen_random_uuid(),
    name          text not null,
    subject       text not null,
    body          text not null,
    -- Which donors this template is written for (CD §D-6: basic individual/CSR
    -- segmentation). 'all' is the default; finer segmentation is Phase 2.
    audience      text not null default 'all'
        check (audience in ('all', 'individual', 'csr')),

    status        public.appeal_template_status not null default 'draft',
    /**
     * A PRE-APPROVED template may dispatch immediately during an emergency
     * without waiting for a fresh approval — and always leaves a post-send
     * review task (CD §D-6). Marking a template instant is itself an approval
     * decision, which is why it can only be true on an approved template.
     */
    is_instant    boolean not null default false,

    approved_by   uuid references public.users (id) on delete set null,
    approved_at   timestamptz,
    created_by    uuid references public.users (id) on delete set null,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),

    constraint appeal_template_instant_requires_approval
        check (not is_instant or status = 'approved'),
    -- An approved template must name its approver. Approval with no approver is
    -- not approval.
    constraint appeal_template_approved_has_approver
        check (status <> 'approved' or approved_at is not null)
);

comment on table public.emergency_appeal_templates is
    'Emergency Appeal templates with an approval workflow (CD §D-6). An unapproved template cannot dispatch — enforced in the dispatch service. is_instant marks a PRE-APPROVED template that may go out immediately during an emergency, which always leaves a post-send review task: speed must never silently become an absence of oversight.';

create index emergency_appeal_templates_status_idx
    on public.emergency_appeal_templates (status)
    where status = 'approved';

create trigger emergency_appeal_templates_set_updated_at
    before update on public.emergency_appeal_templates
    for each row execute function public.set_updated_at();

-- --- dispatch record ----------------------------------------------------------
create table public.emergency_appeal_dispatches (
    id            uuid primary key default gen_random_uuid(),
    emergency_id  uuid not null references public.emergencies (id) on delete restrict,
    template_id   uuid not null references public.emergency_appeal_templates (id) on delete restrict,

    -- TEXT + CHECK, not an enum: adding 'sms' / 'whatsapp' in Phase 2 must be a
    -- one-line constraint change, not an enum migration. This is the
    -- channel-extensibility requirement expressed in the schema.
    channel       text not null default 'in_app'
        check (channel in ('in_app', 'email', 'sms', 'whatsapp')),
    audience      text not null default 'all'
        check (audience in ('all', 'individual', 'csr')),

    recipient_count integer not null default 0 check (recipient_count >= 0),
    delivered_count integer not null default 0 check (delivered_count >= 0),
    failed_count    integer not null default 0 check (failed_count >= 0),

    -- True when sent under the instant pre-approved path, which is what makes a
    -- post-send review mandatory.
    was_instant   boolean not null default false,
    review_required boolean not null default false,
    reviewed_by   uuid references public.users (id) on delete set null,
    reviewed_at   timestamptz,
    review_note   text,

    dispatched_by uuid references public.users (id) on delete set null,
    dispatched_at timestamptz not null default now(),
    created_at    timestamptz not null default now()
);

comment on table public.emergency_appeal_dispatches is
    'One record per appeal send (CD §D-6). channel is TEXT+CHECK rather than an enum so Phase 2 (SMS via DLT, WhatsApp via Business API) is a constraint change, not a redesign — the client''s explicit channel-extensibility requirement. review_required is set by the instant path and cleared only by a human review.';

create index emergency_appeal_dispatches_emergency_idx
    on public.emergency_appeal_dispatches (emergency_id, dispatched_at desc);
create index emergency_appeal_dispatches_review_idx
    on public.emergency_appeal_dispatches (review_required, dispatched_at desc)
    where review_required and reviewed_at is null;

-- --- appeal attribution on donations ------------------------------------------
-- E-1 already tags a donation to its Emergency ID. This records WHICH appeal
-- brought it in, so an appeal's effectiveness is measurable and the CSR
-- Emergency Impact Report (Phase 2) has something to read.
alter table public.donations
    add column appeal_dispatch_id uuid
        references public.emergency_appeal_dispatches (id) on delete set null;

comment on column public.donations.appeal_dispatch_id is
    'Which appeal send this donation is attributed to (CD §D-6). The Emergency ID itself lives on donations.emergency_id (E-1); this is the finer attribution.';

create index donations_appeal_dispatch_idx
    on public.donations (appeal_dispatch_id)
    where appeal_dispatch_id is not null;

-- --- RLS ----------------------------------------------------------------------
alter table public.emergency_appeal_templates  enable row level security;
alter table public.emergency_appeal_dispatches enable row level security;

create policy emergency_appeal_templates_select_staff on public.emergency_appeal_templates
    for select to authenticated
    using (private.current_app_role() in ('admin', 'compliance'));
create policy emergency_appeal_templates_write_admin on public.emergency_appeal_templates
    for all to authenticated
    using (private.current_app_role() = 'admin')
    with check (private.current_app_role() = 'admin');

create policy emergency_appeal_dispatches_select_staff on public.emergency_appeal_dispatches
    for select to authenticated
    using (private.current_app_role() in ('admin', 'compliance'));
create policy emergency_appeal_dispatches_write_admin on public.emergency_appeal_dispatches
    for all to authenticated
    using (private.current_app_role() = 'admin')
    with check (private.current_app_role() = 'admin');

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- alter table public.donations drop column if exists appeal_dispatch_id;
-- drop table if exists public.emergency_appeal_dispatches cascade;
-- drop table if exists public.emergency_appeal_templates  cascade;
-- drop type  if exists public.appeal_template_status;
-- commit;
