const axios = require('axios');

const ServicioMS365 = {
  obtenerUrlAutorizacion() {
    const tenantId = process.env.AZURE_AD_TENANT_ID || 'comun';
    const clientId = process.env.AZURE_AD_CLIENT_ID;
    const redirectUri = encodeURIComponent(process.env.AZURE_AD_REDIRECT_URI);
    const alcance = encodeURIComponent('openid profile email');

    return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&scope=${alcance}&response_mode=query`;
  },

  async obtenerTokenDesdeCodigo(codigo) {
    const tenantId = process.env.AZURE_AD_TENANT_ID || 'comun';
    const clientId = process.env.AZURE_AD_CLIENT_ID;
    const clientSecret = process.env.AZURE_AD_CLIENT_SECRET;
    const redirectUri = process.env.AZURE_AD_REDIRECT_URI;

    const respuesta = await axios.post(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: codigo,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
      {
        encabezados: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    return respuesta.data;
  },

  async obtenerPerfilUsuario(tokenAcceso) {
    const respuesta = await axios.get('https://graph.microsoft.com/v1.0/me', {
      encabezados: {
        Autorización: `Bearer ${tokenAcceso}`,
      },
    });

    return respuesta.data;
  },
};

module.exports = ServicioMS365;
