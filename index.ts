import * as k8s from "@pulumi/kubernetes";
import * as tls from "@pulumi/tls";
import * as github from "@pulumi/github";
import * as flux from "@worawat/flux";

// Require Github configurations
// export GITHUB_TOKEN=your-github-personal-access-token
// export GITHUB_OWNER=your-github-owner

interface Tenant {
  name: string;
  namespaces: string[];
  //   repoName?: string;
}

const branch = "main";
const path = "kubernetes";
const githubOwner = "foot-org";

function setupTenant(t: Tenant) {
  const repoName = `${t.name}-workspace`;
  const resourceName = (key: string) => `${t.name}-${key}`;

  // Generate ssh keys
  const key = new tls.PrivateKey(resourceName("private-key"), {
    algorithm: "ECDSA",
    ecdsaCurve: "P256",
  });

  // Create Github repository
  const repo = new github.Repository(resourceName("repository"), {
    name: repoName,
    visibility: "private",
    autoInit: true,
  });

  new github.BranchDefault(resourceName("branch-default"), {
    repository: repo.name,
    branch,
  });

  new github.RepositoryFile(resourceName("nginx-deployment"), {
    repository: repoName,
    file: "example.txt",
    content: "Hello, Pulumi!",
    branch: "main",
    commitMessage: "Add example.txt",
  });

  // Add generated public key to Github deploy key
  const deployKey = new github.RepositoryDeployKey(
    resourceName("repository-deploy-key"),
    {
      title: "fluxcd",
      repository: repo.name,
      key: key.publicKeyOpenssh,
      readOnly: false,
    }
  );

  const provider = new flux.Provider("flux", {
    kubernetes: {
      configPath: "~/.kube/config",
    },
    git: {
      url: `ssh://git@github.com/${githubOwner}/${repoName}.git`,
      branch,
      ssh: {
        username: "git",
        privateKey: key.privateKeyPem,
      },
    },
  });

  const resource = new flux.FluxBootstrapGit(
    "flux",
    {
      path: path,
    },
    {
      provider: provider,
      dependsOn: deployKey,
    }
  );

  const appLabels = { app: "nginx" };
  const deployment = new k8s.apps.v1.Deployment("nginx", {
    spec: {
      selector: { matchLabels: appLabels },
      replicas: 1,
      template: {
        metadata: { labels: appLabels },
        spec: { containers: [{ name: "nginx", image: "nginx" }] },
      },
    },
  });

  return deployment.metadata.name;
}

export const name = setupTenant({
  name: "ai-team",
  namespaces: ["ai", "observability"],
});
