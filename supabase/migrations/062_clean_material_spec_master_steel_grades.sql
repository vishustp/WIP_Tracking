-- ============================================================================
-- Migration 062: Ensure material_spec_master steel_grade contains actual billet grades
-- Pipe standards (e.g. ASTM A106 Gr B) must not masquerade as steel_grade.
-- ============================================================================

UPDATE public.material_spec_master
SET steel_grade = 'SAE 1018 / 15C8 RS-03'
WHERE spec_key = 'A106' OR spec_full ILIKE '%A106 Gr B%' OR steel_grade ILIKE '%A106%';

UPDATE public.material_spec_master
SET steel_grade = 'IS 2062 / SAE 1020'
WHERE spec_key = 'A53' OR spec_full ILIKE '%A53%' OR steel_grade ILIKE '%A53%';

UPDATE public.material_spec_master
SET steel_grade = 'SAE 1018'
WHERE spec_key = 'A210' AND (steel_grade ILIKE '%A210%' OR steel_grade ILIKE '%MEDIUM-CARBON%');

UPDATE public.material_spec_master
SET steel_grade = 'SAE 1026'
WHERE spec_key = 'A210_C' AND (steel_grade ILIKE '%A210%' OR steel_grade ILIKE '%MEDIUM-CARBON%');

UPDATE public.material_spec_master
SET steel_grade = 'ST 52'
WHERE (spec_key = 'DIN2391_ST52' OR spec_full ILIKE '%DIN 2391%') AND steel_grade ILIKE '%High-Yield%';

UPDATE public.material_spec_master
SET steel_grade = 'SAE 1010'
WHERE (spec_key = 'SA179' OR spec_full ILIKE '%SA 179%') AND steel_grade ILIKE '%Seamless%';

UPDATE public.material_spec_master
SET steel_grade = 'SAE 1010'
WHERE (spec_key = 'SA192' OR spec_full ILIKE '%SA 192%') AND steel_grade ILIKE '%Seamless%';
