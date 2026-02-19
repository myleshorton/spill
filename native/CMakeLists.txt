cmake_minimum_required(VERSION 3.14)
project(samizdat_bridge C)

add_library(samizdat_bridge SHARED
  samizdat_bridge.c
)

target_include_directories(samizdat_bridge PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}
  ${DART_SDK}/runtime/include  # For dart_api_dl.h
)

# Link the Dart API DL implementation
target_sources(samizdat_bridge PRIVATE
  ${DART_SDK}/runtime/include/dart_api_dl.c
)

# When bare-kit prebuilds are available, uncomment:
# target_link_libraries(samizdat_bridge PRIVATE barekit)
# target_include_directories(samizdat_bridge PRIVATE ${BAREKIT_INCLUDE_DIR})

set_target_properties(samizdat_bridge PROPERTIES
  OUTPUT_NAME "samizdat_bridge"
  C_STANDARD 11
)

if(APPLE)
  set_target_properties(samizdat_bridge PROPERTIES
    INSTALL_RPATH "@executable_path/../Frameworks"
  )
endif()
