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
    latency_ms     integer,
    model_name     text,
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

create index idx_image_generation_tasks_owner_created
    on image_generation_tasks (owner_user_id asc, created_at desc);

create index idx_image_generation_tasks_review_created
    on image_generation_tasks (source_review_id asc, created_at desc);

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

create trigger trg_generated_images_updated_at
    before update
    on generated_images
    for each row
execute procedure set_updated_at();


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
