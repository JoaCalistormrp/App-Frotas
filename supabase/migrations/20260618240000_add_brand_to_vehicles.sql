-- Preenche coluna brand nos veículos da frota RM + RP

-- VW
UPDATE public.vehicles SET brand = 'VW' WHERE plate IN (
  'AVQ 2E89','AVQ 4F12','AVV 6G31','AVV 6F95','AVY 1F92','AWA 2H69',
  'BCC 4A74','BEF 2B96','BEF 2B98','CUC 5F89','DKU 3D49',
  'FAQ 7C01','OPR 7A56','QBF 1C23','SWJ 7F87',
  'APP 5A66','AYM 7E51','QPJ 2J27'
);

-- M.BENZ
UPDATE public.vehicles SET brand = 'M.BENZ' WHERE plate IN (
  'CQU 5D18','DKU 7F19','DRU 3J09','FAB 6I94',
  'FOP 4C17','FPN 3J66','FXH 7G27','GJH 7E94','SWW 4D67',
  'FTP 4I41','FAU 4C03'
);

-- FIAT
UPDATE public.vehicles SET brand = 'FIAT' WHERE plate IN (
  'AZX 1B45','RHF 3H42',
  'BAO 8B01','FVL 1D29','QIZ 7H93','QSH 5I50','SWB 4E55','SWH 6G45'
);

-- FORD
UPDATE public.vehicles SET brand = 'FORD' WHERE plate IN ('DBC 3I59','DUF 4I25','OVI 9H18');

-- CHEVROLET
UPDATE public.vehicles SET brand = 'CHEVROLET' WHERE plate IN ('FMV 3A91','EYZ 7I41');

-- Outros
UPDATE public.vehicles SET brand = 'IMP GM'         WHERE plate = 'ARJ 3H00';
UPDATE public.vehicles SET brand = 'AGRALE'         WHERE plate = 'APX 6B46';
UPDATE public.vehicles SET brand = 'F-4000'         WHERE plate = 'AVV 6G36';
UPDATE public.vehicles SET brand = 'RETROESCAVADEIRA' WHERE plate = 'SLP23061706';
