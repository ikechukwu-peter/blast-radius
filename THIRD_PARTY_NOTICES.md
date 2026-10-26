# Third-party notices

The MIT license in [LICENSE](LICENSE) covers the code in this repository. It does not cover the files below, which belong to their owners and are included under their own terms.

## Cloud provider icons (`public/cloud/`)

The icons in `public/cloud/aws`, `public/cloud/azure` and `public/cloud/gcp` are trademarks of their owners. They are included, unmodified, so that people can draw architecture diagrams of those providers' services, which is the use each provider publishes them for.

| Folder | Source | Owner |
|---|---|---|
| `public/cloud/aws/` | [AWS Architecture Icons](https://aws.amazon.com/architecture/icons/) | Amazon Web Services, Inc. |
| `public/cloud/azure/` | [Azure architecture icons](https://learn.microsoft.com/azure/architecture/icons/) | Microsoft Corporation |
| `public/cloud/gcp/` | [Google Cloud icons](https://cloud.google.com/icons) | Google LLC |

How the app follows the providers' guidelines:

- Each icon is shown only for the service it represents, and the service's full name appears next to it, in the editor and in exported videos.
- The files are not recoloured, cropped, rotated or distorted. The editor hides the colour picker for these components, and the video renderer draws the files as they are.
- Blast Radius is not affiliated with, or endorsed by, Amazon, Microsoft or Google.

If you fork this project, check each provider's current terms before reusing the icons.

## Libraries

Bundled libraries keep their own licenses, which are listed in `package.json` and `node_modules`. Video encoding uses [Mediabunny](https://mediabunny.dev) (MPL-2.0), unmodified.
