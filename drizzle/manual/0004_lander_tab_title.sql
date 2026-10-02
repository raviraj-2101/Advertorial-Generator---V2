-- 0004_lander_tab_title.sql
--
-- Operator: "In the Lander setting, I also want you to allow us to edit
-- the text that's on the tab, like the thing that's next to the fav
-- icon check image."
--
-- Adds a per-lander browser-tab title that overrides the magazine name
-- in <title> when set. Falls back to magazine.name when null.

alter table advertorials_v2.landers add column if not exists tab_title text;

notify pgrst, 'reload schema';
