-- Migration 002: Media support + multi-subdomain NQT-style weights
-- Safe to run multiple times (IF NOT EXISTS / ALTER)

-- Media attached to question stem
ALTER TABLE items ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS media_type VARCHAR(20); -- 'image', 'video', 'youtube', 'audio'

-- Multi sub-domains with weightage (NQT-style)
-- Structure: [{"domain": "Verbal Reasoning", "weight": 0.4}, {"domain": "Numerical", "weight": 0.6}]
ALTER TABLE items ADD COLUMN IF NOT EXISTS sub_domains JSONB DEFAULT '[]'::jsonb;

-- Comment for clarity
COMMENT ON COLUMN items.sub_domains IS 'Array of {domain: string, weight: float} for multi-subdomain NQT scoring';
COMMENT ON COLUMN items.media_url IS 'URL to image/video/audio/youtube. Options can have their own media in the options JSONB.';

-- Scoring config at instrument level
ALTER TABLE instruments ADD COLUMN IF NOT EXISTS scoring_config JSONB DEFAULT '{}'::jsonb;
-- Structure: {"total_weight": 1.0, "sub_domain_weights": {"Verbal": 0.4, "Numerical": 0.6}, "passing_score": 50}

-- Mark as NQT-style (weighted composite scoring)
ALTER TABLE instruments ADD COLUMN IF NOT EXISTS uses_weighted_scoring BOOLEAN DEFAULT FALSE;
