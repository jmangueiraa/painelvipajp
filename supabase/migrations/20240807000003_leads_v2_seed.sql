UPDATE public.leads 
SET 
    funnel_stage = 'decisao',
    urgency = 'Alta',
    conversion_probability = 0.85,
    lead_score = 92,
    topics = ARRAY['Assinatura Anual', 'Canais 4K', 'Suporte'],
    positive_signals = ARRAY['Mencionou preço', 'Comparou concorrentes'],
    labels = ARRAY['VIP', 'Urgent']
WHERE name = 'João Silva';

UPDATE public.leads 
SET 
    funnel_stage = 'consideracao',
    urgency = 'Média',
    conversion_probability = 0.50,
    lead_score = 65,
    topics = ARRAY['Grade de Esportes', 'Teste Grátis'],
    positive_signals = ARRAY['Ativo no Direct'],
    labels = ARRAY['Potencial']
WHERE name = 'Maria Oliveira';

UPDATE public.leads 
SET 
    funnel_stage = 'descoberta',
    urgency = 'Baixa',
    conversion_probability = 0.15,
    lead_score = 28,
    topics = ARRAY['Dúvidas Gerais'],
    negative_signals = ARRAY['Apenas curioso']
WHERE name = 'Pedro Santos';

INSERT INTO public.leads (name, platform, keyword, interest_level, status, funnel_stage, lead_score, conversion_probability, topics, profile_link)
VALUES 
('Carlos Souza', 'Telegram', 'Assinatura IPTV', 'Alto', 'Novo', 'decisao', 88, 0.75, ARRAY['Ativação Imediata'], 'https://t.me/carloss'),
('Ana Lima', 'Facebook', 'Canais ao vivo', 'Baixo', 'Novo', 'descoberta', 15, 0.05, ARRAY['Disponibilidade'], 'https://facebook.com/analima');
