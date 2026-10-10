-- Legacy schema snapshot kept for reference.
-- Runtime database changes are managed by backend/alembic migrations.

create table users
(
    id                bigserial
        primary key,
    public_id         text                                                   not null
        unique,
    clerk_user_id     text
        unique,
    email             text                                                   not null
        unique,
    username          text                                                   not null
        unique,
    password_hash     text,
    plan              user_plan                default 'free'::user_plan     not null,
    daily_quota_total integer                  default 0                     not null
        constraint users_daily_quota_total_check
            check (daily_quota_total >= 0),
    daily_quota_used  integer                  default 0                     not null
        constraint users_daily_quota_used_check
            check (daily_quota_used >= 0),
    status            user_status              default 'active'::user_status not null,
    last_login_at     timestamp with time zone,
    created_at        timestamp with time zone default now()                 not null,
    updated_at        timestamp with time zone default now()                 not null,
    daily_quota_date  date                     default CURRENT_DATE          not null
);

alter table users
    owner to pic;

create index idx_users_status_plan
    on users (status, plan);

create trigger trg_users_updated_at
    before update
    on users
    for each row
execute procedure set_updated_at();

create table photos
(
    id              bigserial
        primary key,
    public_id       text                                                       not null
        unique,
    owner_user_id   bigint                                                     not null
        references users,
    upload_id       text                                                       not null,
    bucket          text                                                       not null,
    object_key      text                                                       not null,
    content_type    text                                                       not null,
    size_bytes      bigint                                                     not null
        constraint photos_size_bytes_check
            check (size_bytes > 0),
    checksum_sha256 text,
    width           integer
        constraint photos_width_check
            check (width > 0),
    height          integer
        constraint photos_height_check
            check (height > 0),
    status          photo_status             default 'UPLOADING'::photo_status not null,
    exif_data       jsonb                    default '{}'::jsonb               not null,
    client_meta     jsonb                    default '{}'::jsonb               not null,
    nsfw_label      text,
    nsfw_score      numeric(5, 4)
        constraint chk_photos_nsfw_score
            check ((nsfw_score IS NULL) OR ((nsfw_score >= (0)::numeric) AND (nsfw_score <= (1)::numeric))),
    rejected_reason text,
    created_at      timestamp with time zone default now()                     not null,
    updated_at      timestamp with time zone default now()                     not null,
    constraint uq_photos_bucket_object
        unique (bucket, object_key)
);

alter table photos
    owner to pic;

create index idx_photos_owner_created
    on photos (owner_user_id asc, created_at desc);

create index idx_photos_status
    on photos (status);

create trigger trg_photos_updated_at
    before update
    on photos
    for each row
execute procedure set_updated_at();

create table review_tasks
(
    id                bigserial
        primary key,
    public_id         text                                                    not null
        unique,
    photo_id          bigint                                                  not null
        references photos,
    owner_user_id     bigint                                                  not null
        references users,
    mode              review_mode                                             not null,
    status            task_status              default 'PENDING'::task_status not null,
    idempotency_key   text,
    request_payload   jsonb                    default '{}'::jsonb            not null,
    attempt_count     integer                  default 0                      not null
        constraint review_tasks_attempt_count_check
            check (attempt_count >= 0),
    max_attempts      integer                  default 3                      not null
        constraint review_tasks_max_attempts_check
            check (max_attempts > 0),
    progress          integer                  default 0                      not null
        constraint review_tasks_progress_check
            check ((progress >= 0) AND (progress <= 100)),
    error_code        text,
    error_message     text,
    started_at        timestamp with time zone,
    finished_at       timestamp with time zone,
    expire_at         timestamp with time zone,
    created_at        timestamp with time zone default now()                  not null,
    updated_at        timestamp with time zone default now()                  not null,
    next_attempt_at   timestamp with time zone,
    claimed_by        text,
    last_heartbeat_at timestamp with time zone,
    dead_lettered_at  timestamp with time zone,
    constraint uq_review_tasks_user_idempotency
        unique (owner_user_id, idempotency_key)
);

alter table review_tasks
    owner to pic;

create index idx_review_tasks_status_created
    on review_tasks (status, created_at);

create index idx_review_tasks_photo_created
    on review_tasks (photo_id asc, created_at desc);

create index idx_review_tasks_owner_created
    on review_tasks (owner_user_id asc, created_at desc);

create index idx_review_tasks_next_attempt
    on review_tasks (status, next_attempt_at);

create table review_quota_reservations
(
    id         bigserial primary key,
    task_id    bigint unique references review_tasks (id) on delete cascade,
    user_id    bigint not null references users (id) on delete cascade,
    mode       text not null,
    bill_date  date not null,
    status     text not null
        constraint chk_review_quota_reservations_status
            check (status in ('held', 'consumed', 'released')),
    expires_at timestamp with time zone not null
);

alter table review_quota_reservations owner to postgres;

create index idx_review_quota_reservations_user_day_status
    on review_quota_reservations (user_id, bill_date, status);

create trigger trg_review_tasks_updated_at
    before update
    on review_tasks
    for each row
execute procedure set_updated_at();

create table reviews
(
    id             bigserial
        primary key,
    public_id      text                                         not null
        unique,
    task_id        bigint
        unique
        references review_tasks,
    photo_id       bigint                                       not null
        references photos,
    owner_user_id  bigint                                       not null
        references users,
    source_review_id bigint
        references reviews,
    mode           review_mode                                  not null,
    status         review_status                                not null,
    image_type     text                     default 'default'::text not null,
    schema_version text                     default '1.0'::text not null,
    result_json    jsonb                    default '{}'::jsonb not null,
    is_public      boolean                  default false        not null,
    share_token    text
        unique,
    favorite       boolean                  default false        not null,
    tags_json      jsonb                    default '[]'::jsonb not null,
    note           text,
    deleted_at     timestamp with time zone,
    input_tokens   integer,
    output_tokens  integer,
    cost_usd       numeric(12, 6),
    cost_rate_version text,
    latency_ms     integer,
    model_name     text,
    scorer_model_name text,
    writer_model_name text,
    created_at     timestamp with time zone default now()       not null,
    updated_at     timestamp with time zone default now()       not null,
    final_score    numeric(4, 2)                                not null,
    constraint chk_reviews_tokens_non_negative
        check (((input_tokens IS NULL) OR (input_tokens >= 0)) AND ((output_tokens IS NULL) OR (output_tokens >= 0)) AND
               ((latency_ms IS NULL) OR (latency_ms >= 0)))
);

alter table reviews
    owner to pic;

create index idx_reviews_photo_created
    on reviews (photo_id asc, created_at desc);

create index idx_reviews_owner_created
    on reviews (owner_user_id asc, created_at desc);

create index idx_reviews_owner_deleted_created
    on reviews (owner_user_id asc, deleted_at asc, created_at desc);

create index idx_reviews_owner_image_type_created
    on reviews (owner_user_id asc, image_type asc, created_at desc);

create index idx_reviews_mode_created
    on reviews (mode asc, created_at desc);

create index idx_reviews_source_review
    on reviews (source_review_id);

create trigger trg_reviews_updated_at
    before update
    on reviews
    for each row
execute procedure set_updated_at();

create table blog_post_views
(
    id         bigserial
        primary key,
    slug       text                                   not null,
    view_count integer                  default 0     not null
        constraint chk_blog_post_views_count_non_negative
            check (view_count >= 0),
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    constraint uq_blog_post_views_slug
        unique (slug)
);

alter table blog_post_views
    owner to pic;

create index idx_blog_post_views_count
    on blog_post_views (view_count desc);

create trigger trg_blog_post_views_updated_at
    before update
    on blog_post_views
    for each row
execute procedure set_updated_at();

create table idempotency_keys
(
    id              bigserial
        primary key,
    user_id         bigint                                 not null
        references users,
    endpoint        text                                   not null,
    idempotency_key text                                   not null,
    request_hash    text                                   not null,
    http_status     integer,
    response_json   jsonb,
    expire_at       timestamp with time zone               not null,
    created_at      timestamp with time zone default now() not null,
    constraint uq_idempotency_user_endpoint_key
        unique (user_id, endpoint, idempotency_key)
);

alter table idempotency_keys
    owner to pic;

create index idx_idempotency_expire_at
    on idempotency_keys (expire_at);

create table usage_ledger
(
    id         bigserial
        primary key,
    user_id    bigint                                       not null
        references users,
    review_id  bigint
        references reviews,
    task_id    bigint
        references review_tasks,
    usage_type text                                         not null,
    amount     numeric(18, 6)                               not null,
    unit       text                                         not null,
    bill_date  date                                         not null,
    metadata   jsonb                    default '{}'::jsonb not null,
    created_at timestamp with time zone default now()       not null
);

alter table usage_ledger
    owner to pic;

create index idx_usage_ledger_user_bill_date
    on usage_ledger (user_id asc, bill_date desc);

create index idx_usage_ledger_type_bill_date
    on usage_ledger (usage_type asc, bill_date desc);

create table rate_limit_counters
(
    id             bigserial
        primary key,
    scope          text                                   not null,
    scope_key      text                                   not null,
    endpoint       text,
    window_start   timestamp with time zone               not null,
    window_seconds integer                                not null
        constraint rate_limit_counters_window_seconds_check
            check (window_seconds > 0),
    hit_count      integer                  default 0     not null
        constraint rate_limit_counters_hit_count_check
            check (hit_count >= 0),
    created_at     timestamp with time zone default now() not null,
    updated_at     timestamp with time zone default now() not null,
    constraint uq_rate_limit_window
        unique (scope, scope_key, endpoint, window_start, window_seconds)
);

alter table rate_limit_counters
    owner to pic;

create index idx_rate_limit_scope_window
    on rate_limit_counters (scope asc, scope_key asc, window_start desc);

create trigger trg_rate_limit_updated_at
    before update
    on rate_limit_counters
    for each row
execute procedure set_updated_at();

create table api_request_logs
(
    id             bigserial
        primary key,
    request_id     text                                   not null
        unique,
    method         text                                   not null,
    path           text                                   not null,
    query_string   text,
    endpoint       text,
    client_ip      text,
    user_public_id text,
    user_agent     text,
    request_body   text,
    status_code    integer                                not null,
    duration_ms    integer                                not null
        constraint api_request_logs_duration_ms_check
            check (duration_ms >= 0),
    created_at     timestamp with time zone default now() not null
);

alter table api_request_logs
    owner to pic;

create index idx_api_request_logs_created
    on api_request_logs (created_at desc);

create index idx_api_request_logs_user_created
    on api_request_logs (user_public_id asc, created_at desc);

create index idx_api_request_logs_ip_created
    on api_request_logs (client_ip asc, created_at desc);

create index idx_api_request_logs_path_created
    on api_request_logs (path asc, created_at desc);

create table review_task_events
(
    id             bigserial
        primary key,
    task_id        bigint                                       not null
        references review_tasks,
    task_public_id text                                         not null,
    event_type     text                                         not null,
    status         text                                         not null,
    progress       integer                  default 0           not null
        constraint review_task_events_progress_check
            check ((progress >= 0) AND (progress <= 100)),
    attempt_count  integer                  default 0           not null
        constraint review_task_events_attempt_count_check
            check (attempt_count >= 0),
    error_code     text,
    message        text,
    payload_json   jsonb                    default '{}'::jsonb not null,
    created_at     timestamp with time zone default now()       not null
);

alter table review_task_events
    owner to pic;

alter table review_task_events
    drop constraint if exists review_task_events_task_id_fkey,
    add constraint review_task_events_task_id_fkey
        foreign key (task_id) references review_tasks (id) on delete cascade;

create index idx_review_task_events_task_created
    on review_task_events (task_id asc, created_at desc);

create index idx_review_task_events_public_created
    on review_task_events (task_public_id asc, created_at desc);

create index idx_review_task_events_type_created
    on review_task_events (event_type asc, created_at desc);


create table image_generation_tasks
(
    id                bigserial
        primary key,
    public_id         text                                                    not null
        unique,
    owner_user_id     bigint                                                  not null
        references users,
    source_photo_id   bigint
        references photos,
    source_review_id  bigint
        references reviews,
    status            task_status              default 'PENDING'::task_status not null,
    generation_mode   text                     default 'general'::text        not null,
    intent            text                                                    not null,
    prompt            text                                                    not null,
    prompt_hash       text                                                    not null,
    idempotency_key   text,
    request_payload   jsonb                    default '{}'::jsonb            not null,
    attempt_count     integer                  default 0                      not null
        constraint image_generation_tasks_attempt_count_check
            check (attempt_count >= 0),
    max_attempts      integer                  default 2                      not null
        constraint image_generation_tasks_max_attempts_check
            check (max_attempts > 0),
    progress          integer                  default 0                      not null
        constraint image_generation_tasks_progress_check
            check ((progress >= 0) AND (progress <= 100)),
    error_code        text,
    error_message     text,
    started_at        timestamp with time zone,
    finished_at       timestamp with time zone,
    next_attempt_at   timestamp with time zone,
    claimed_by        text,
    last_heartbeat_at timestamp with time zone,
    created_at        timestamp with time zone default now()                  not null,
    updated_at        timestamp with time zone default now()                  not null,
    constraint uq_image_generation_tasks_user_idempotency
        unique (owner_user_id, idempotency_key)
);

alter table image_generation_tasks
    owner to pic;

create index idx_image_generation_tasks_status_created
    on image_generation_tasks (status, created_at);

create index idx_image_generation_tasks_status_next_attempt
    on image_generation_tasks (status, next_attempt_at);

create index idx_image_generation_tasks_owner_created
    on image_generation_tasks (owner_user_id asc, created_at desc);

create index idx_image_generation_tasks_review_created
    on image_generation_tasks (source_review_id asc, created_at desc);

create index idx_image_generation_tasks_pending_request_event
    on image_generation_tasks (id)
    where request_payload ? 'pending_request_event';

create index idx_image_generation_tasks_pending_terminal_event
    on image_generation_tasks (id)
    where request_payload ? 'pending_terminal_event';

create trigger trg_image_generation_tasks_updated_at
    before update
    on image_generation_tasks
    for each row
execute procedure set_updated_at();

create table generated_images
(
    id                  bigserial
        primary key,
    public_id           text                                          not null
        unique,
    task_id             bigint
        references image_generation_tasks,
    owner_user_id       bigint                                        not null
        references users,
    source_photo_id     bigint
        references photos,
    source_review_id    bigint
        references reviews,
    object_bucket       text                                          not null,
    object_key          text                                          not null,
    content_type        text                     default 'image/webp'::text not null,
    width               integer,
    height              integer,
    intent              text                                          not null,
    generation_mode     text                     default 'general'::text not null,
    prompt              text                                          not null,
    revised_prompt      text,
    model_name          text                                          not null,
    model_snapshot      text,
    quality             text                                          not null,
    size                text                                          not null,
    output_format       text                                          not null,
    input_text_tokens   integer,
    input_image_tokens  integer,
    output_image_tokens integer,
    cost_usd            numeric(12, 6),
    credits_charged     integer                                      not null
        constraint generated_images_credits_charged_check
            check (credits_charged >= 0),
    template_key        text,
    metadata_json       jsonb                    default '{}'::jsonb not null,
    deleted_at          timestamp with time zone,
    created_at          timestamp with time zone default now()        not null,
    updated_at          timestamp with time zone default now()        not null
);

alter table generated_images
    owner to pic;

create index idx_generated_images_owner_created
    on generated_images (owner_user_id asc, created_at desc);

create index idx_generated_images_task
    on generated_images (task_id);

create index idx_generated_images_review_created
    on generated_images (source_review_id asc, created_at desc);

create index idx_generated_images_object
    on generated_images (object_bucket asc, object_key asc);

create trigger trg_generated_images_updated_at
    before update
    on generated_images
    for each row
execute procedure set_updated_at();


create table generation_credit_reservations
(
    id                       bigserial
        primary key,
    generation_task_id       bigint                                                   not null
        references image_generation_tasks,
    user_id                  bigint                                                   not null
        references users,
    credits                  integer                                                  not null
        constraint chk_generation_credit_reservations_credits_positive
            check (credits > 0),
    bill_period_start        date                                                     not null,
    bill_period_end          date                                                     not null,
    status                   text                     default 'held'::text            not null
        constraint chk_generation_credit_reservations_status
            check (status = any (array ['held'::text, 'consumed'::text, 'released'::text])),
    consumed_usage_ledger_id bigint
        references usage_ledger,
    release_reason           text,
    held_at                  timestamp with time zone default now()                   not null,
    consumed_at              timestamp with time zone,
    released_at              timestamp with time zone,
    created_at               timestamp with time zone default now()                   not null,
    updated_at               timestamp with time zone default now()                   not null,
    constraint uq_generation_credit_reservations_task
        unique (generation_task_id),
    constraint uq_generation_credit_reservations_consumed_ledger
        unique (consumed_usage_ledger_id),
    constraint chk_generation_credit_reservations_period
        check (bill_period_end > bill_period_start)
);

alter table generation_credit_reservations
    owner to pic;

create index idx_generation_credit_reservations_user_period_status
    on generation_credit_reservations (user_id, bill_period_start, status);

create index idx_generation_credit_reservations_status_created
    on generation_credit_reservations (status, created_at);

create or replace function set_generation_credit_reservation_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger trg_generation_credit_reservations_updated_at
    before update
    on generation_credit_reservations
    for each row
execute function set_generation_credit_reservation_updated_at();


create table billing_subscriptions
(
    id                                          bigserial
        primary key,
    user_id                                     bigint                                       not null
        references users,
    provider                                    text                     default 'lemonsqueezy'::text not null,
    provider_customer_id                        text,
    provider_order_id                           text,
    provider_subscription_id                    text,
    store_id                                    text,
    product_id                                  text,
    variant_id                                  text,
    product_name                                text,
    variant_name                                text,
    status                                      text                     default 'pending'::text not null,
    user_email                                  text,
    cancelled                                   boolean                  default false      not null,
    test_mode                                   boolean                  default false      not null,
    renews_at                                   timestamp with time zone,
    ends_at                                     timestamp with time zone,
    trial_ends_at                               timestamp with time zone,
    update_payment_method_url                   text,
    customer_portal_url                         text,
    customer_portal_update_subscription_url     text,
    last_event_name                             text,
    last_event_at                               timestamp with time zone,
    last_invoice_id                             text,
    last_payment_status                         text,
    last_payment_at                             timestamp with time zone,
    raw_payload                                 jsonb                    default '{}'::jsonb not null,
    created_at                                  timestamp with time zone default now()       not null,
    updated_at                                  timestamp with time zone default now()       not null
);

alter table billing_subscriptions
    owner to pic;

create unique index uq_billing_subscriptions_provider_subscription
    on billing_subscriptions (provider asc, provider_subscription_id asc);

create index idx_billing_subscriptions_user_provider
    on billing_subscriptions (user_id asc, provider asc);

create index idx_billing_subscriptions_provider_customer
    on billing_subscriptions (provider_customer_id);

create index idx_billing_subscriptions_status_updated
    on billing_subscriptions (status asc, updated_at desc);

create table billing_activation_codes
(
    id                  bigserial
        primary key,
    code_hash           text                                         not null,
    code_prefix         text                                         not null,
    duration_days       integer                  default 30          not null
        constraint chk_billing_activation_codes_duration_days
            check (duration_days > 0),
    source              text                     default 'ifdian'::text not null,
    batch_id            text,
    note                text,
    redeemed_by_user_id bigint
        references users,
    redeemed_at         timestamp with time zone,
    expires_at          timestamp with time zone,
    disabled_at         timestamp with time zone,
    metadata_json       jsonb                    default '{}'::jsonb not null,
    created_at          timestamp with time zone default now()       not null,
    updated_at          timestamp with time zone default now()       not null,
    constraint uq_billing_activation_codes_hash
        unique (code_hash)
);

alter table billing_activation_codes
    owner to pic;

create index idx_billing_activation_codes_prefix
    on billing_activation_codes (code_prefix asc);

create index idx_billing_activation_codes_batch_created
    on billing_activation_codes (batch_id asc, created_at desc);

create index idx_billing_activation_codes_redeemed
    on billing_activation_codes (redeemed_at desc);

create trigger trg_billing_activation_codes_updated_at
    before update
    on billing_activation_codes
    for each row
execute procedure set_updated_at();

create table billing_webhook_events
(
    id             bigserial
        primary key,
    provider       text                     default 'lemonsqueezy'::text not null,
    event_name     text                                         not null,
    event_hash     text                                         not null,
    resource_type  text,
    resource_id    text,
    test_mode      boolean                  default false        not null,
    outcome        text,
    user_id        bigint
        references users,
    payload_json   jsonb                    default '{}'::jsonb not null,
    processed_at   timestamp with time zone,
    created_at     timestamp with time zone default now()       not null
);

alter table billing_webhook_events
    owner to pic;

create unique index uq_billing_webhook_events_provider_hash
    on billing_webhook_events (provider asc, event_hash asc);

create index idx_billing_webhook_events_provider_created
    on billing_webhook_events (provider asc, created_at desc);

create index idx_billing_webhook_events_event_name_created
    on billing_webhook_events (event_name asc, created_at desc);


-- 2026-10-10: inbox and private score feedback

CREATE TABLE announcements (
	id BIGSERIAL NOT NULL,
	public_id TEXT NOT NULL,
	content_version INTEGER DEFAULT '1' NOT NULL,
	title_json JSONB NOT NULL,
	summary_json JSONB NOT NULL,
	body_json JSONB NOT NULL,
	cta_json JSONB NOT NULL,
	audience_type TEXT NOT NULL,
	audience_json JSONB NOT NULL,
	status TEXT DEFAULT 'draft' NOT NULL,
	idempotency_key TEXT,
	content_fingerprint TEXT NOT NULL,
	update_id TEXT,
	created_by TEXT,
	operation_log_json JSONB NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	published_at TIMESTAMP WITH TIME ZONE,
	cancelled_at TIMESTAMP WITH TIME ZONE,
	expires_at TIMESTAMP WITH TIME ZONE,
	PRIMARY KEY (id),
	CONSTRAINT uq_announcements_idempotency_key UNIQUE (idempotency_key),
	CONSTRAINT chk_announcements_status CHECK (status IN ('draft', 'published', 'cancelled')),
	CONSTRAINT chk_announcements_audience_type CHECK (audience_type IN ('all_existing_users', 'specific_users')),
	UNIQUE (public_id)
);

ALTER TABLE announcements OWNER TO pic;

CREATE INDEX idx_announcements_status_published ON announcements (status, published_at);

CREATE UNIQUE INDEX uq_announcements_active_update ON announcements (update_id) WHERE update_id IS NOT NULL AND status = 'published';

CREATE TABLE notification_preferences (
	user_id BIGINT NOT NULL,
	likes_enabled BOOLEAN DEFAULT 'false' NOT NULL,
	announcements_enabled BOOLEAN DEFAULT 'false' NOT NULL,
	likes_enabled_at TIMESTAMP WITH TIME ZONE,
	announcements_enabled_at TIMESTAMP WITH TIME ZONE,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (user_id),
	CONSTRAINT uq_notification_preferences_user UNIQUE (user_id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

ALTER TABLE notification_preferences OWNER TO pic;

CREATE TABLE notification_events (
	id BIGSERIAL NOT NULL,
	public_id TEXT NOT NULL,
	event_type TEXT NOT NULL,
	dedupe_key TEXT NOT NULL,
	schema_version INTEGER DEFAULT '1' NOT NULL,
	payload_json JSONB NOT NULL,
	recipient_user_id BIGINT,
	optional_preference_eligible BOOLEAN,
	occurred_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	status TEXT DEFAULT 'pending' NOT NULL,
	attempts INTEGER DEFAULT '0' NOT NULL,
	available_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	processed_at TIMESTAMP WITH TIME ZONE,
	last_error_code TEXT,
	cursor_json JSONB NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_notification_events_dedupe_key UNIQUE (dedupe_key),
	CONSTRAINT chk_notification_events_status CHECK (status IN ('pending', 'processing', 'delivered', 'suppressed_preferences', 'suppressed_limit', 'suppressed_inactive', 'suppressed_self', 'expired_delivery', 'failed')),
	UNIQUE (public_id),
	FOREIGN KEY(recipient_user_id) REFERENCES users (id) ON DELETE CASCADE
);

ALTER TABLE notification_events OWNER TO pic;

CREATE INDEX idx_notification_events_recipient_occurred ON notification_events (recipient_user_id, occurred_at);

CREATE INDEX idx_notification_events_status_available ON notification_events (status, available_at, id);

CREATE TABLE notifications (
	id BIGSERIAL NOT NULL,
	public_id TEXT NOT NULL,
	recipient_user_id BIGINT NOT NULL,
	category TEXT NOT NULL,
	notification_type TEXT NOT NULL,
	dedupe_key TEXT NOT NULL,
	template_key TEXT NOT NULL,
	template_version INTEGER DEFAULT '1' NOT NULL,
	template_params_json JSONB NOT NULL,
	target_type TEXT,
	target_public_id TEXT,
	announcement_id BIGINT,
	occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
	delivered_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	read_at TIMESTAMP WITH TIME ZONE,
	archived_at TIMESTAMP WITH TIME ZONE,
	revoked_at TIMESTAMP WITH TIME ZONE,
	expires_at TIMESTAMP WITH TIME ZONE,
	PRIMARY KEY (id),
	CONSTRAINT uq_notifications_recipient_dedupe UNIQUE (recipient_user_id, dedupe_key),
	CONSTRAINT chk_notifications_category CHECK (category IN ('system', 'announcement', 'interaction')),
	UNIQUE (public_id),
	FOREIGN KEY(recipient_user_id) REFERENCES users (id) ON DELETE CASCADE,
	FOREIGN KEY(announcement_id) REFERENCES announcements (id)
);

ALTER TABLE notifications OWNER TO pic;

CREATE INDEX idx_notifications_announcement ON notifications (announcement_id);

CREATE INDEX idx_notifications_recipient_delivered ON notifications (recipient_user_id, delivered_at, id);

CREATE INDEX idx_notifications_recipient_unread ON notifications (recipient_user_id, delivered_at) WHERE read_at IS NULL AND archived_at IS NULL AND revoked_at IS NULL;

CREATE TABLE review_score_snapshots (
	id BIGSERIAL NOT NULL,
	public_id TEXT NOT NULL,
	review_id BIGINT NOT NULL,
	revision_hash TEXT NOT NULL,
	snapshot_schema_version TEXT NOT NULL,
	analysis_type TEXT NOT NULL,
	mode TEXT NOT NULL,
	image_type TEXT NOT NULL,
	final_score NUMERIC(10, 6) NOT NULL,
	scores_json JSONB NOT NULL,
	score_version TEXT,
	score_prompt_version TEXT,
	scorer_model_name TEXT,
	scorer_model_version TEXT,
	scorer_reasoning_effort TEXT,
	scorer_preprocess_version TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_review_score_snapshots_revision UNIQUE (review_id, revision_hash),
	CONSTRAINT chk_review_score_snapshots_analysis_type CHECK (analysis_type = 'single'),
	CONSTRAINT chk_review_score_snapshots_score CHECK (final_score >= 0 AND final_score <= 10),
	UNIQUE (public_id),
	FOREIGN KEY(review_id) REFERENCES reviews (id) ON DELETE CASCADE
);

ALTER TABLE review_score_snapshots OWNER TO pic;

CREATE INDEX idx_review_score_snapshots_review_created ON review_score_snapshots (review_id, created_at);

CREATE INDEX idx_review_score_snapshots_version_mode ON review_score_snapshots (score_version, mode, created_at);

CREATE TABLE review_score_feedback (
	id BIGSERIAL NOT NULL,
	public_id TEXT NOT NULL,
	snapshot_id BIGINT NOT NULL,
	user_id BIGINT NOT NULL,
	role_at_submission TEXT NOT NULL,
	source_surface TEXT NOT NULL,
	verdict TEXT NOT NULL,
	state TEXT DEFAULT 'active' NOT NULL,
	feedback_version INTEGER DEFAULT '1' NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	withdrawn_at TIMESTAMP WITH TIME ZONE,
	PRIMARY KEY (id),
	CONSTRAINT uq_review_score_feedback_snapshot_user UNIQUE (snapshot_id, user_id),
	CONSTRAINT chk_review_score_feedback_verdict CHECK (verdict IN ('accurate', 'too_high', 'too_low')),
	CONSTRAINT chk_review_score_feedback_role CHECK (role_at_submission IN ('author', 'community')),
	CONSTRAINT chk_review_score_feedback_surface CHECK (source_surface IN ('result', 'gallery')),
	CONSTRAINT chk_review_score_feedback_state CHECK (state IN ('active', 'withdrawn')),
	CONSTRAINT chk_review_score_feedback_version CHECK (feedback_version >= 1),
	CONSTRAINT chk_review_score_feedback_withdrawn CHECK ((state = 'active' AND withdrawn_at IS NULL) OR (state = 'withdrawn' AND withdrawn_at IS NOT NULL)),
	UNIQUE (public_id),
	FOREIGN KEY(snapshot_id) REFERENCES review_score_snapshots (id) ON DELETE CASCADE,
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

ALTER TABLE review_score_feedback OWNER TO pic;

CREATE INDEX idx_review_score_feedback_snapshot_role_state ON review_score_feedback (snapshot_id, role_at_submission, state);

CREATE INDEX idx_review_score_feedback_user_created ON review_score_feedback (user_id, created_at);

CREATE OR REPLACE FUNCTION reject_review_score_snapshot_update() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Review score snapshots are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER review_score_snapshot_immutable BEFORE UPDATE ON review_score_snapshots
FOR EACH ROW EXECUTE FUNCTION reject_review_score_snapshot_update();
