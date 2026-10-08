-- Official CVM reports can publish zero or negative NAV. Preserve the published value and provenance.
alter table fund_nav_history drop constraint fund_nav_history_nav_check;
