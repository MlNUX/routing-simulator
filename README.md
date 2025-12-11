For reproducible buils we use docker wrapped in a Makefile. There are commands to build and run the container. After every code change the container needs to be rebuilt and rerun. The Makefile is configure so that every container is removed when another is getting started. For testing the website just clone the repo and run make dockerbuild.


# Local Testing
make run

# Docker Testing

make dockerrun

make dockerstop (else the docker will continue to run)

# First installing everything 

1. Cloning Repo
2. make dockerbuild

