-- Complete Database Schema Export
-- Run this in Hasura Console or your PostgreSQL client

-- =============================================================================
-- TABLES AND COLUMNS
-- =============================================================================

SELECT 'TABLES AND COLUMNS:' as section;

SELECT
    t.table_name,
    c.column_name,
    c.data_type,
    c.character_maximum_length,
    c.is_nullable,
    c.column_default,
    c.ordinal_position
FROM information_schema.tables t
JOIN information_schema.columns c ON t.table_name = c.table_name
WHERE t.table_schema = 'public'
AND t.table_type = 'BASE TABLE'
ORDER BY t.table_name, c.ordinal_position;

-- =============================================================================
-- CONSTRAINTS
-- =============================================================================

SELECT 'CONSTRAINTS:' as section;

SELECT
    tc.table_name,
    tc.constraint_name,
    tc.constraint_type,
    array_agg(kcu.column_name ORDER BY kcu.ordinal_position) as columns,
    pg_get_constraintdef(pgc.oid) as constraint_definition
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
LEFT JOIN pg_constraint pgc ON tc.constraint_name = pgc.conname
WHERE tc.table_schema = 'public'
GROUP BY tc.table_name, tc.constraint_name, tc.constraint_type, pgc.oid
ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name;

-- =============================================================================
-- INDEXES
-- =============================================================================

SELECT 'INDEXES:' as section;

SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- =============================================================================
-- FOREIGN KEY RELATIONSHIPS
-- =============================================================================

SELECT 'FOREIGN KEYS:' as section;

SELECT
    tc.table_name as source_table,
    kcu.column_name as source_column,
    ccu.table_name as target_table,
    ccu.column_name as target_column,
    tc.constraint_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
AND tc.table_schema = 'public'
ORDER BY tc.table_name, tc.constraint_name;

-- =============================================================================
-- ENUMS
-- =============================================================================

SELECT 'ENUMS:' as section;

SELECT
    t.typname as enum_name,
    array_agg(e.enumlabel ORDER BY e.enumsortorder) as enum_values
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
GROUP BY t.typname
ORDER BY t.typname;

-- =============================================================================
-- FUNCTIONS AND TRIGGERS
-- =============================================================================

SELECT 'FUNCTIONS:' as section;

SELECT
    routine_name,
    routine_type,
    data_type as return_type,
    routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
ORDER BY routine_name;

SELECT 'TRIGGERS:' as section;

SELECT
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement,
    action_timing
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- =============================================================================
-- TABLE ROW COUNTS
-- =============================================================================

SELECT 'TABLE ROW COUNTS:' as section;

SELECT
    schemaname,
    tablename,
    n_tup_ins as inserts,
    n_tup_upd as updates,
    n_tup_del as deletes,
    n_live_tup as live_rows,
    n_dead_tup as dead_rows
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY tablename;