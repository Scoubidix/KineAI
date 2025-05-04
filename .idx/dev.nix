{ pkgs }: {
  channel = "stable-24.11";

  packages = [
    pkgs.openssh
    pkgs.nodejs_20
    pkgs.git
    pkgs.python311
    pkgs.python311Packages.pip
  ];

  env = {};

  idx = {
    extensions = [
      # "vscodevim.vim"
    ];

    workspace = {
      onCreate = {
        default.openFiles = [
          "src/app/page.tsx"
        ];
      };
    };

    previews = {
      enable = true;
      previews = {
        web = {
          command = ["npm" "run" "dev" "--" "--port" "$PORT" "--hostname" "0.0.0.0"];
          manager = "web";
        };
      };
    };
  };
}
