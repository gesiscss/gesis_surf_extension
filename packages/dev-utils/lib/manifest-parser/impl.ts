import { ManifestParserInterface, Manifest } from './type';

export const ManifestParserImpl: ManifestParserInterface = {
  convertManifestToString: (manifest, env) => {
    if (env === 'firefox') {
      manifest = convertToFirefoxCompatibleManifest(manifest);
    }
    return JSON.stringify(manifest, null, 2);
  },
};

function convertToFirefoxCompatibleManifest(manifest: Manifest) {
  const manifestCopy = {
    ...manifest,
  } as { [key: string]: unknown };

  manifestCopy.background = {
    scripts: [manifest.background?.service_worker],
    type: 'module',
  };

  if (manifest.options_page) {
    manifestCopy.options_ui = {
      page: manifest.options_page,
      browser_style: false,
    };
    delete manifestCopy.options_page;
  }

  manifestCopy.content_security_policy = {
    extension_pages: "script-src 'self'; object-src 'self'",
  };

  return manifestCopy as Manifest;
}
