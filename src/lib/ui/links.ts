// Links públicos do produto. O convite do bot depende do id da aplicação do Discord (público, mas mora no
// Doppler como GUARITA_APP_ID): preencher aqui depois do deploy. Vazio = a tela diz "em breve".
export const DISCORD_APP_ID = '';
export const DISCORD_INVITE = DISCORD_APP_ID
  ? `https://discord.com/oauth2/authorize?client_id=${DISCORD_APP_ID}&scope=bot+applications.commands`
  : '';
