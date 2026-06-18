-- Seed: frota completa RM + RP
-- Mapeamento TIPO DE CHECKLIST → vehicle_type enum:
--   CAMINHÃO + CESTO AEREO  → CESTO_AEREO
--   CAMINHÃO + MUNCH        → MUNCK
--   CAMINHÃO (sem equip.)   → PESADOS
--   OPERACIONAL             → OPERACIONAIS
--   ADMINISTRATIVO          → ADMINISTRATIVO
--   MAQUINARIO              → PESADOS

INSERT INTO public.vehicles (plate, model, vehicle_type, sector)
VALUES
  -- RM
  ('ARJ 3H00',    'IMP GM SILVERADO CONQ',      'OPERACIONAIS',  'RM'),
  ('AVQ 2E89',    'VW 5.140E DELIVERY',          'CESTO_AEREO',   'RM'),
  ('AVQ 4F12',    'VW 5.140E DELIVERY',          'CESTO_AEREO',   'RM'),
  ('AVV 6G31',    'VW 5.140E DELIVERY',          'CESTO_AEREO',   'RM'),
  ('AVV 6F95',    'VW 5.140E DELIVERY',          'CESTO_AEREO',   'RM'),
  ('AVY 1F92',    'VW 5.140E DELIVERY',          'CESTO_AEREO',   'RM'),
  ('AWA 2H69',    'VW 5.140E DELIVERY',          'CESTO_AEREO',   'RM'),
  ('AZX 1B45',    'FIAT STRADA WORKING',         'OPERACIONAIS',  'RM'),
  ('BCC 4A74',    'VW 8.160 DRC 4X2',            'CESTO_AEREO',   'RM'),
  ('BEF 2B96',    'VW 9.170 DRC 4X2',            'CESTO_AEREO',   'RM'),
  ('BEF 2B98',    'VW 11.180 DRC 4X2',           'CESTO_AEREO',   'RM'),
  ('CQU 5D18',    'M.BENZ ACELO 1016C BAU',      'PESADOS',       'RM'),
  ('CUC 5F89',    'VW 8.150E DELIVERY',          'CESTO_AEREO',   'RM'),
  ('DBC 3I59',    'FORD CARGO 1317F',            'MUNCK',         'RM'),
  ('DUF 4I25',    'FORD F4000 G',                'CESTO_AEREO',   'RM'),
  ('DKU 3D49',    'VW 6.160 DRC 4X2',            'CESTO_AEREO',   'RM'),
  ('DKU 7F19',    'M.BENZ ACCELO 1016 CE',       'CESTO_AEREO',   'RM'),
  ('DRU 3J09',    'M.BENZ ACCELO 1016 CE',       'CESTO_AEREO',   'RM'),
  ('FAB 6I94',    'M.BENZ ACCELO 1016 CE',       'CESTO_AEREO',   'RM'),
  ('FAQ 7C01',    'VW POLO MCA',                 'ADMINISTRATIVO','RM'),
  ('FMV 3A91',    'CHEVROLET MONTANA LS',        'OPERACIONAIS',  'RM'),
  ('FOP 4C17',    'M.BENZ ACCELO 1016 CE',       'CESTO_AEREO',   'RM'),
  ('FPN 3J66',    'M.BENZ ACCELO 1016 CE',       'CESTO_AEREO',   'RM'),
  ('FXH 7G27',    'M.BENZ ACCELO 1016 CE',       'CESTO_AEREO',   'RM'),
  ('GJH 7E94',    'M.BENZ ACCELO 1016',          'PESADOS',       'RM'),
  ('OPR 7A56',    'VW 5.150 DRC 4X2',            'CESTO_AEREO',   'RM'),
  ('OVI 9H18',    'FORD CARGO 816 S',            'CESTO_AEREO',   'RM'),
  ('QBF 1C23',    'VW 5.150 DRC 4X2',            'CESTO_AEREO',   'RM'),
  ('RHF 3H42',    'FIAT STRADA FREEDOM 13CS',    'OPERACIONAIS',  'RM'),
  ('SWJ 7F87',    'VW POLO TRACK MA',            'ADMINISTRATIVO','RM'),
  ('SWW 4D67',    'M.BENZ ACCELO 1016',          'CESTO_AEREO',   'RM'),
  ('SLP23061706', 'RETROESCAVADEIRA',            'PESADOS',       'RM'),

  -- RP
  ('APP 5A66',    'VW 17.180 EURO3 WORKER',      'CESTO_AEREO',   'RP'),
  ('APX 6B46',    'AGRALE MARRUA AM 200CC',      'CESTO_AEREO',   'RP'),
  ('AVV 6G36',    'F-4000 4X4',                  'CESTO_AEREO',   'RP'),
  ('AYM 7E51',    'VW 13.190 WORKER',            'MUNCK',         'RP'),
  ('BAO 8B01',    'FIAT STRADA WORKING',         'OPERACIONAIS',  'RP'),
  ('EYZ 7I41',    'CHEVROLET MONTANA LS',        'OPERACIONAIS',  'RP'),
  ('FTP 4I41',    'M.BENZ ACCELO 815',           'CESTO_AEREO',   'RP'),
  ('FAU 4C03',    'M.BENZ ACCELO 815',           'CESTO_AEREO',   'RP'),
  ('FVL 1D29',    'FIAT STRADA WORKING',         'OPERACIONAIS',  'RP'),
  ('QIZ 7H93',    'FIAT STRADA HD WK CE E',      'OPERACIONAIS',  'RP'),
  ('QPJ 2J27',    'VW NOVA SAVEIRO TL MBVS',     'OPERACIONAIS',  'RP'),
  ('QSH 5I50',    'FIAT STRADA HD WK CC E',      'OPERACIONAIS',  'RP'),
  ('SWB 4E55',    'FIAT MOBI LIKE',              'ADMINISTRATIVO','RP'),
  ('SWH 6G45',    'FIAT STRADA FREEDOM CS13',    'OPERACIONAIS',  'RP')

ON CONFLICT (plate) DO NOTHING;
